import { useMemo, useRef, useEffect } from 'react'
import { useLoader, useFrame, useThree } from '@react-three/fiber'
import { TextureLoader, RepeatWrapping, ShaderMaterial, Color, Vector3, Matrix4, Plane, Vector4, PerspectiveCamera, WebGLRenderTarget, FrontSide } from 'three'

import { WATER_LEVEL, WATER_DEPTH_CONFIG } from '../config/water'
import { sunDirection, sunColor, skyColorZenith, skyColorHorizon } from '../config/environment'
import { getWaveUniforms } from '../utils/water/wavePhysics'

import waterVertexShader from '../shaders/water.vert.glsl'
import waterFragmentShader from '../shaders/water.frag.glsl'

/**
 * Create the shared water material with reflection support.
 * This material is used by all water tiles.
 */
const createWaterMaterial = (waterNormals, renderTarget, textureMatrix) => {
	const waveUniforms = getWaveUniforms()

	const material = new ShaderMaterial({
		vertexShader: waterVertexShader,
		fragmentShader: waterFragmentShader,
		uniforms: {
			// Water rendering uniforms
			normalSampler: { value: waterNormals },
			mirrorSampler: { value: renderTarget.texture },
			textureMatrix: { value: textureMatrix },
			alpha: { value: 1.0 },
			time: { value: 0 },
			size: { value: 10.0 },
			distortionScale: { value: 8.0 },
			sunColor: { value: sunColor.clone() },
			sunDirection: { value: sunDirection.clone() },
			eye: { value: new Vector3() },
			waterColor: {
				value: new Color(WATER_DEPTH_CONFIG.waterColor[0], WATER_DEPTH_CONFIG.waterColor[1], WATER_DEPTH_CONFIG.waterColor[2]),
			},

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
			shorelineDepthThreshold: { value: WATER_DEPTH_CONFIG.shorelineDepthThreshold },
			shallowDepthThreshold: { value: WATER_DEPTH_CONFIG.shallowDepthThreshold },

			// Depth-based visual effects
			maxVisibleDepth: { value: WATER_DEPTH_CONFIG.maxVisibleDepth },
			edgeFadeDistance: { value: WATER_DEPTH_CONFIG.edgeFadeDistance },
		},
		lights: false,
		fog: false,
		side: FrontSide,
		transparent: true,
		depthWrite: false,
	})

	return material
}

/**
 * Custom hook to create and manage water material with reflections.
 * Handles material creation, reflection rendering, and cleanup.
 *
 * @returns {ShaderMaterial} The water material with animated reflections
 */
const useWaterMaterial = () => {
	const { gl, scene, camera } = useThree()

	// Load water normal texture
	const waterNormals = useLoader(TextureLoader, '/assets/images/ground/water_normal.jpg')
	useMemo(() => {
		waterNormals.wrapS = waterNormals.wrapT = RepeatWrapping
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
	})

	// Initialize reflection objects
	useMemo(() => {
		const refs = reflectionRefs.current
		refs.renderTarget = new WebGLRenderTarget(512, 512)
		refs.mirrorCamera = new PerspectiveCamera()
		refs.textureMatrix = new Matrix4()
	}, [])

	// Create shared water material
	const waterMaterial = useMemo(() => {
		const refs = reflectionRefs.current
		return createWaterMaterial(waterNormals, refs.renderTarget, refs.textureMatrix)
	}, [waterNormals])

	// Store water material ref for cleanup
	const waterMaterialRef = useRef(waterMaterial)
	waterMaterialRef.current = waterMaterial

	// Throttle reflection updates (update every N frames)
	const frameCounter = useRef(0)
	const REFLECTION_UPDATE_INTERVAL = 2 // Update every 2 frames

	// Cache previous camera parameters to detect changes
	const prevCameraParams = useRef({ fov: 0, aspect: 0, near: 0, far: 0 })

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

		// Update time uniform (always needed for wave animation)
		waterMaterial.uniforms.time.value += delta

		// Update eye position
		const cameraWorldPosition = refs.cameraWorldPosition
		cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld)
		waterMaterial.uniforms.eye.value.copy(cameraWorldPosition)

		// Throttle reflection rendering
		frameCounter.current++
		if (frameCounter.current % REFLECTION_UPDATE_INTERVAL !== 0) {
			return
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

		// Only update projection if camera params changed
		const prev = prevCameraParams.current
		const paramsChanged = prev.fov !== camera.fov || prev.aspect !== camera.aspect || prev.near !== camera.near || prev.far !== camera.far

		if (paramsChanged) {
			mirrorCamera.far = camera.far
			mirrorCamera.near = camera.near
			mirrorCamera.fov = camera.fov
			mirrorCamera.aspect = camera.aspect
			prev.fov = camera.fov
			prev.aspect = camera.aspect
			prev.near = camera.near
			prev.far = camera.far
		}

		mirrorCamera.updateMatrixWorld()
		if (paramsChanged) {
			mirrorCamera.updateProjectionMatrix()
		}

		// Calculate texture matrix
		textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
		textureMatrix.multiply(mirrorCamera.projectionMatrix)
		textureMatrix.multiply(mirrorCamera.matrixWorldInverse)

		// Set up clip plane for oblique frustum culling
		mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorWorldPosition)
		mirrorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse)
		clipPlane.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant)

		const projectionMatrix = mirrorCamera.projectionMatrix
		q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0]
		q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5]
		q.z = -1
		q.w = (1 + projectionMatrix.elements[10]) / projectionMatrix.elements[14]
		clipPlane.multiplyScalar(2 / clipPlane.dot(q))
		projectionMatrix.elements[2] = clipPlane.x
		projectionMatrix.elements[6] = clipPlane.y
		projectionMatrix.elements[10] = clipPlane.z + 1
		projectionMatrix.elements[14] = clipPlane.w

		// Render reflection
		const currentRenderTarget = gl.getRenderTarget()
		const currentXrEnabled = gl.xr.enabled
		const currentShadowAutoUpdate = gl.shadowMap.autoUpdate

		// Temporarily hide water tiles by making material invisible
		const originalVisible = waterMaterial.visible
		waterMaterial.visible = false

		gl.xr.enabled = false
		gl.shadowMap.autoUpdate = false
		gl.setRenderTarget(renderTarget)
		gl.state.buffers.depth.setMask(true)

		if (gl.autoClear === false) {
			gl.clear()
		}

		gl.render(scene, mirrorCamera)

		// Restore state
		waterMaterial.visible = originalVisible
		gl.xr.enabled = currentXrEnabled
		gl.shadowMap.autoUpdate = currentShadowAutoUpdate
		gl.setRenderTarget(currentRenderTarget)

		const viewport = camera.viewport
		if (viewport !== undefined) {
			gl.state.viewport(viewport)
		}
	})

	return waterMaterial
}

export default useWaterMaterial
