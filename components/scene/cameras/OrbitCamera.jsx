import { useRef, useEffect } from 'react'
import { Vector3, MathUtils } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

import useGameStore, { vehicleState } from '../../../store/gameStore'
import { dampVector3 } from '../../../utils/dampVector3'
import { useGroundAvoidance } from '../../../hooks/useGroundAvoidance'

// Orbit camera controller
const OrbitCamera = ({ followSpeed, minGroundDistance, transitionFromInfo }) => {
	const cameraAutoRotate = useGameStore((state) => state.cameraAutoRotate)
	const physicsEnabled = useGameStore((state) => state.physicsEnabled)
	const camera = useThree((state) => state.camera)
	const orbitControlsRef = useRef()

	const cameraPosition = useRef(new Vector3())
	const targetWithOffset = useRef(new Vector3())
	const targetFov = 24 // Default FOV for orbit camera
	const lastFov = useRef(camera.fov)

	// Transition state
	const isTransitioning = useRef(false)
	const transitionStartTime = useRef(0)
	const startPos = useRef(new Vector3())

	useEffect(() => {
		if (transitionFromInfo) {
			isTransitioning.current = true
			transitionStartTime.current = 0
			startPos.current.copy(camera.position)
		}
	}, [transitionFromInfo, camera])

	// Use shared ground avoidance hook with target reference for midpoint sampling
	const checkGroundAvoidance = useGroundAvoidance(cameraPosition, minGroundDistance, targetWithOffset)

	// Initialize controls target to vehicle position to prevent swooping from origin
	useEffect(() => {
		if (orbitControlsRef.current) {
			orbitControlsRef.current.target.copy(vehicleState.position)
			orbitControlsRef.current.target.y += 0.95
		}
	}, [])

	useFrame((state, delta) => {
		if (!orbitControlsRef.current) return

		// Transition logic
		if (isTransitioning.current) {
			if (transitionStartTime.current === 0) {
				transitionStartTime.current = state.clock.elapsedTime
			}

			// 1.5 second transition
			const t = (state.clock.elapsedTime - transitionStartTime.current) / 1.5

			if (t >= 1) {
				isTransitioning.current = false
			} else {
				const isPortrait = window.innerWidth / window.innerHeight < 1
				const defaultOffset = isPortrait ? new Vector3(-2, 1, 12) : new Vector3(-4, 1, 6.5)
				const targetCamPos = new Vector3().copy(vehicleState.position).add(defaultOffset)

				const alpha = 1 - Math.pow(1 - t, 3) // Ease out cubic
				camera.position.lerpVectors(startPos.current, targetCamPos, alpha)
			}
		}

		// Get the target position from vehicleState
		const target = vehicleState.position
		const controlsTarget = orbitControlsRef.current.target

		// Calculate target with Y offset
		targetWithOffset.current.set(target.x, target.y + 0.95, target.z)

		// Use damp for frame-rate independent smoothing
		dampVector3(controlsTarget, targetWithOffset.current, followSpeed, delta)

		// Smoothly transition FOV back to default - only update projection matrix when FOV changes
		const newFov = MathUtils.damp(camera.fov, targetFov, 3, delta)
		if (Math.abs(newFov - lastFov.current) > 0.01) {
			camera.fov = newFov
			camera.updateProjectionMatrix()
			lastFov.current = newFov
		}

		orbitControlsRef.current.update()

		// Ground avoidance logic - only when physics is enabled
		if (physicsEnabled) {
			camera.getWorldPosition(cameraPosition.current)
			checkGroundAvoidance()

			// Apply ground avoidance adjustment to camera if needed
			if (cameraPosition.current.y !== camera.position.y) {
				camera.position.y = cameraPosition.current.y
			}
		}
	})

	return (
		<OrbitControls
			ref={orbitControlsRef}
			enableDamping
			dampingFactor={0.025}
			minDistance={2}
			maxDistance={24}
			minPolarAngle={Math.PI / 6}
			maxPolarAngle={physicsEnabled ? Math.PI : Math.PI / 2}
			autoRotate={cameraAutoRotate}
			autoRotateSpeed={-0.3}
			enableKeys={false}
		/>
	)
}

export default OrbitCamera
