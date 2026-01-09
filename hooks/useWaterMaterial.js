import { useMemo, useRef, useEffect } from 'react'
import { useLoader, useFrame, useThree } from '@react-three/fiber'
import { TextureLoader, RepeatWrapping, ShaderMaterial, Color, Vector3, Matrix4, Plane, Vector4, PerspectiveCamera, WebGLRenderTarget, FrontSide } from 'three'

import { WATER_LEVEL } from '../config/water'
import { useBiomeWater, useBiomeEnvironment } from './useBiome'
import { getWaveUniforms } from '../utils/water/wavePhysics'

import waterVertexShader from '../shaders/water.vert.glsl'
import waterFragmentShader from '../shaders/water.frag.glsl'

/**
 * Custom hook to create and manage water material with reflections.
 * Handles material creation, reflection rendering, and cleanup.
 *
 * @returns {ShaderMaterial} The water material with animated reflections
 */
const useWaterMaterial = () => {
	const { gl, scene, camera } = useThree()

	// Get biome-specific configs
	const waterConfig = useBiomeWater()
	const envConfig = useBiomeEnvironment()

	// Load water normal texture
	const waterNormals = useLoader(TextureLoader, '/assets/images/ground/water_normal.jpg')
	useEffect(() => {
		if (waterNormals) {
			waterNormals.wrapS = waterNormals.wrapT = RepeatWrapping
		}
	}, [waterNormals])

	// Create reflection render target and related objects
	const reflectionRefs = useRef({
		renderTarget: null,
		mirrorCamera: null,
		textureMatrix: null,
		// Scratch vectors for reflection calculation
		mirrorWorldPosition: new Vector3(0, WATER_LEVEL, 0),
		cameraWorldPosition: new Vector3(),
		normal: new Vector3(0, 1, 0), // Water surface normal (up)
		view: new Vector3(),
		target: new Vector3(),
		lookAtPosition: new Vector3(),
		rotationMatrix: new Matrix4(),
		mirrorPlane: new Plane(),
		clipPlane: new Vector4(),
		q: new Vector4(),
		// Track render target size
		rtWidth: 0,
		rtHeight: 0,
		// Reusable objects
		clearColor: new Color(),
	})

	// Initialize reflection objects
	useMemo(() => {
		const refs = reflectionRefs.current
		// Start with a reasonable size, will be resized to match screen
		refs.renderTarget = new WebGLRenderTarget(1024, 1024)
		refs.mirrorCamera = new PerspectiveCamera()
		refs.textureMatrix = new Matrix4()
	}, [])

	// Create shared water material
	const waterMaterial = useMemo(() => {
		const refs = reflectionRefs.current
		const { sunDirection, sunColor, skyColorZenith, skyColorHorizon } = envConfig
		const waveUniforms = getWaveUniforms()

		return new ShaderMaterial({
			vertexShader: waterVertexShader,
			fragmentShader: waterFragmentShader,
			uniforms: {
				// Water rendering uniforms
				normalSampler: { value: waterNormals },
				mirrorSampler: { value: refs.renderTarget.texture },
				textureMatrix: { value: refs.textureMatrix },
				alpha: { value: 1.0 },
				time: { value: 0 },
				size: { value: 10.0 },
				distortionScale: { value: 8.0 },
				sunColor: { value: sunColor.clone() },
				sunDirection: { value: sunDirection.clone() },
				eye: { value: new Vector3() },
				waterColor: { value: new Color(waterConfig.waterColor[0], waterConfig.waterColor[1], waterConfig.waterColor[2]) },

				// Sky colors for reflection fallback
				skyColor: { value: skyColorZenith.clone() },
				skyHorizonColor: { value: skyColorHorizon.clone() },

				// Wave uniforms
				waveA: { value: waveUniforms.waveA },
				waveB: { value: waveUniforms.waveB },
				waveC: { value: waveUniforms.waveC },
				offsetX: { value: 0 },
				offsetZ: { value: 0 },

				// Depth-based wave modulation
				shorelineDepthThreshold: { value: waterConfig.shorelineDepthThreshold },
				shallowDepthThreshold: { value: waterConfig.shallowDepthThreshold },

				// Depth-based visual effects
				maxVisibleDepth: { value: waterConfig.maxVisibleDepth },
				edgeFadeDistance: { value: waterConfig.edgeFadeDistance },
			},
			lights: false,
			fog: false,
			side: FrontSide,
			transparent: true,
			depthWrite: false,
		})
	}, [waterNormals, waterConfig, envConfig])

	// Store water material ref for cleanup
	const waterMaterialRef = useRef(waterMaterial)
	waterMaterialRef.current = waterMaterial

	// Throttle reflection updates (update every N frames)
	const frameCounter = useRef(0)
	const REFLECTION_UPDATE_INTERVAL = 2 // Update every 2 frames

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			const refs = reflectionRefs.current
			if (refs.renderTarget) {
				refs.renderTarget.dispose()
			}
			if (waterMaterialRef.current) {
				waterMaterialRef.current.dispose()
			}
		}
	}, [])

	// Animate water and update reflections each frame
	useFrame((_, delta) => {
		if (!waterMaterial) return

		const refs = reflectionRefs.current

		// Get current environment config for reflection clear color
		const { skyColorHorizon } = envConfig

		// Update time uniform (always needed for wave animation)
		waterMaterial.uniforms.time.value += delta

		// Update eye position
		const cameraWorldPosition = refs.cameraWorldPosition
		cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld)
		waterMaterial.uniforms.eye.value.copy(cameraWorldPosition)

		// Skip reflection if camera is very far from water (> 1000 units)
		const distanceToWater = Math.abs(cameraWorldPosition.y - WATER_LEVEL)
		if (distanceToWater > 1000) return

		// Throttle reflection rendering
		frameCounter.current++
		if (frameCounter.current % REFLECTION_UPDATE_INTERVAL !== 0) {
			return
		}

		// Resize render target to match screen size (at half resolution for performance)
		const pixelRatio = gl.getPixelRatio()
		const targetWidth = Math.floor(gl.domElement.clientWidth * pixelRatio * 0.5)
		const targetHeight = Math.floor(gl.domElement.clientHeight * pixelRatio * 0.5)
		if (refs.rtWidth !== targetWidth || refs.rtHeight !== targetHeight) {
			refs.renderTarget.setSize(targetWidth, targetHeight)
			refs.rtWidth = targetWidth
			refs.rtHeight = targetHeight
		}

		const { renderTarget, mirrorCamera, textureMatrix, mirrorWorldPosition, normal, view, target, lookAtPosition, rotationMatrix, mirrorPlane, clipPlane, q } = refs

		// Water surface is at Y = WATER_LEVEL, facing up
		mirrorWorldPosition.set(cameraWorldPosition.x, WATER_LEVEL, cameraWorldPosition.z)
		normal.set(0, 1, 0)

		// Check if camera is above water (only render reflection from above)
		view.subVectors(mirrorWorldPosition, cameraWorldPosition)
		if (view.dot(normal) > 0) {
			// Camera is below water, skip reflection
			return
		}

		// Calculate reflection camera position
		view.reflect(normal).negate()
		view.add(mirrorWorldPosition)

		// Calculate look-at target for reflection camera
		rotationMatrix.extractRotation(camera.matrixWorld)
		lookAtPosition.set(0, 0, -1)
		lookAtPosition.applyMatrix4(rotationMatrix)
		lookAtPosition.add(cameraWorldPosition)
		target.subVectors(mirrorWorldPosition, lookAtPosition)
		target.reflect(normal).negate()
		target.add(mirrorWorldPosition)

		// Set up mirror camera
		mirrorCamera.position.copy(view)
		mirrorCamera.up.set(0, 1, 0)
		mirrorCamera.up.applyMatrix4(rotationMatrix)
		mirrorCamera.up.reflect(normal)
		mirrorCamera.lookAt(target)

		// Update mirror camera projection to match main camera
		mirrorCamera.far = camera.far
		mirrorCamera.near = camera.near
		mirrorCamera.fov = camera.fov
		mirrorCamera.aspect = camera.aspect

		mirrorCamera.updateMatrixWorld()
		mirrorCamera.updateProjectionMatrix()

		// Calculate texture matrix
		textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
		textureMatrix.multiply(mirrorCamera.projectionMatrix)
		textureMatrix.multiply(mirrorCamera.matrixWorldInverse)

		// Set up clip plane for oblique frustum culling
		mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorWorldPosition)
		mirrorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse)
		clipPlane.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant)

		const projectionMatrix = mirrorCamera.projectionMatrix
		const elements = projectionMatrix.elements // Cache array reference
		q.x = (Math.sign(clipPlane.x) + elements[8]) / elements[0]
		q.y = (Math.sign(clipPlane.y) + elements[9]) / elements[5]
		q.z = -1
		q.w = (1 + elements[10]) / elements[14]
		clipPlane.multiplyScalar(2 / clipPlane.dot(q))
		elements[2] = clipPlane.x
		elements[6] = clipPlane.y
		elements[10] = clipPlane.z + 1
		elements[14] = clipPlane.w

		// Render reflection
		const currentRenderTarget = gl.getRenderTarget()
		const currentXrEnabled = gl.xr.enabled
		const currentShadowAutoUpdate = gl.shadowMap.autoUpdate
		gl.getClearColor(refs.clearColor) // Reuse Color instance
		const currentClearAlpha = gl.getClearAlpha()

		// Temporarily hide water tiles by making material invisible
		const originalVisible = waterMaterial.visible
		waterMaterial.visible = false

		gl.xr.enabled = false
		gl.shadowMap.autoUpdate = false
		gl.setRenderTarget(renderTarget)
		gl.state.buffers.depth.setMask(true)

		// Set clear color to sky horizon so unrendered areas blend with sky reflection
		gl.setClearColor(skyColorHorizon, 1.0)
		gl.clear(true, true, false)

		gl.render(scene, mirrorCamera)

		// Restore state
		waterMaterial.visible = originalVisible
		gl.xr.enabled = currentXrEnabled
		gl.shadowMap.autoUpdate = currentShadowAutoUpdate
		gl.setClearColor(refs.clearColor, currentClearAlpha)
		gl.setRenderTarget(currentRenderTarget)

		const viewport = camera.viewport
		if (viewport !== undefined) {
			gl.state.viewport(viewport)
		}
	})

	return waterMaterial
}

export default useWaterMaterial
