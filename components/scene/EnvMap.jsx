import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CubeCamera, WebGLCubeRenderTarget, HalfFloatType, LinearMipmapLinearFilter } from 'three'

import useGameStore from '../../store/gameStore'

// Dynamic environment map using CubeCamera - captures sky and terrain for reflections
// Renders in realtime during initial load to avoid flash, then locks in after scene is loaded
const EnvMap = () => {
	const { gl, scene } = useThree()
	const cubeCameraRef = useRef()
	const renderTargetRef = useRef()
	const lockedRef = useRef(false)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const sceneLoaded = useGameStore((state) => state.sceneLoaded)

	// Create cube camera and render target
	useEffect(() => {
		const resolution = performanceDegraded ? 128 : 256
		const renderTarget = new WebGLCubeRenderTarget(resolution, {
			type: HalfFloatType,
			generateMipmaps: true,
			minFilter: LinearMipmapLinearFilter,
		})
		renderTargetRef.current = renderTarget

		const cubeCamera = new CubeCamera(1, 1000, renderTarget)
		cubeCameraRef.current = cubeCamera

		// Reset locked flag when resources change
		lockedRef.current = false

		return () => {
			renderTarget.dispose()
		}
	}, [performanceDegraded])

	// Update environment map - realtime during load, then lock after scene is loaded
	useFrame(() => {
		// Skip if already locked or resources not ready
		if (lockedRef.current || !cubeCameraRef.current || !renderTargetRef.current) return

		// Position cube camera at origin with some height for good sky/terrain capture
		cubeCameraRef.current.position.set(0, 5, 0)

		// Temporarily hide fog for cleaner reflections
		const originalFog = scene.fog
		scene.fog = null

		// Capture the environment map
		cubeCameraRef.current.update(gl, scene)

		// Restore fog
		scene.fog = originalFog

		// Set environment map on the scene
		scene.environment = renderTargetRef.current.texture
		scene.environmentIntensity = 0.8

		// Lock in once scene is fully loaded - won't update again
		if (sceneLoaded) {
			lockedRef.current = true
		}
	})

	return null
}

export default EnvMap
