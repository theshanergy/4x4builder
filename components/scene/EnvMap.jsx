import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CubeCamera, WebGLCubeRenderTarget, HalfFloatType, LinearMipmapLinearFilter } from 'three'

import useGameStore from '../../store/gameStore'

// Dynamic environment map using CubeCamera - captures sky and terrain for reflections
// Only renders once after initial scene load since the environment looks the same everywhere
const EnvMap = () => {
	const { gl, scene } = useThree()
	const cubeCameraRef = useRef()
	const renderTargetRef = useRef()
	const frameCount = useRef(0)
	const capturedRef = useRef(false)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)

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

		// Reset captured flag when resources change
		capturedRef.current = false
		frameCount.current = 0

		return () => {
			renderTarget.dispose()
		}
	}, [performanceDegraded])

	// Capture environment map once after scene is loaded
	useFrame(() => {
		// Skip if already captured or resources not ready
		if (capturedRef.current || !cubeCameraRef.current || !renderTargetRef.current) return

		frameCount.current++

		// Wait a few frames for scene to fully load before capturing
		if (frameCount.current < 10) return

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
		scene.environmentIntensity = 0.4

		// Mark as captured - won't run again
		capturedRef.current = true
	})

	return null
}

export default EnvMap
