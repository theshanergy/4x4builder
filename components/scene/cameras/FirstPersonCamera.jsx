import { useRef, useEffect } from 'react'
import { Vector3, MathUtils, Quaternion, Matrix4 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'

import useGameStore, { sceneState } from '../../../store/gameStore'
import vehicleConfigs from '../../../vehicleConfigs'

const UP_VECTOR = new Vector3(0, 1, 0)

// Get driver position for a vehicle body, with fallback to default
export const getDriverPosition = (bodyId) => {
	const vehicle = vehicleConfigs.vehicles[bodyId]
	if (vehicle?.driverPosition) {
		return new Vector3(...vehicle.driverPosition)
	}
	// Default driver position if not specified in config
	return new Vector3(0.4, 1.55, 0)
}

// First-person camera controller
const FirstPersonCamera = ({ target }) => {
	const camera = useThree((state) => state.camera)
	const currentVehicle = useGameStore((state) => state.currentVehicle)

	// Get driver position from vehicle config
	const driverPosition = useRef(getDriverPosition(currentVehicle.body))

	// Transition state - use elapsed time for consistency with rest of codebase
	const isTransitioning = useRef(true)
	const transitionStartElapsed = useRef(0)
	const startPos = useRef(camera.position.clone())
	const startQuat = useRef(camera.quaternion.clone())
	const startFov = useRef(camera.fov)
	const targetFov = 70 // Target FOV for first-person mode
	const isMounted = useRef(false)
	const transitionStartedThisFrame = useRef(false)

	useEffect(() => {
		if (isMounted.current) {
			isTransitioning.current = true
			transitionStartedThisFrame.current = true // Will be set properly in useFrame
			startPos.current.copy(camera.position)
			startQuat.current.copy(camera.quaternion)
			startFov.current = camera.fov
		} else {
			isMounted.current = true
		}
	}, [camera])

	// Update driver position when vehicle changes
	useEffect(() => {
		driverPosition.current = getDriverPosition(currentVehicle.body)
	}, [currentVehicle.body])

	// Set near clipping plane for first-person mode (prevents seat/interior from blocking view)
	useEffect(() => {
		const originalNear = camera.near
		camera.near = 0.1 // Increased from default to cull nearby geometry like the seat
		return () => {
			camera.near = originalNear
			camera.updateProjectionMatrix()
		}
	}, [camera])

	// Temp vectors to avoid GC
	const tempPosition = useRef(new Vector3())
	const tempQuat = useRef(new Quaternion())
	const tempOffset = useRef(new Vector3())
	const targetPosition = useRef(new Vector3())
	const targetLookAt = useRef(new Vector3())
	const forwardOffset = useRef(new Vector3())
	const targetQuat = useRef(new Quaternion())
	const dummyMatrix = useRef(new Matrix4())

	useFrame((state) => {
		// Capture transition start time on first frame after transition begins
		if (transitionStartedThisFrame.current) {
			transitionStartElapsed.current = state.clock.elapsedTime
			transitionStartedThisFrame.current = false
		}

		if (!target) return

		// Get target world position and rotation
		target.getWorldPosition(tempPosition.current)
		target.getWorldQuaternion(tempQuat.current)

		// Calculate driver head position in world space
		tempOffset.current.copy(driverPosition.current)
		tempOffset.current.applyQuaternion(tempQuat.current)
		targetPosition.current.copy(tempPosition.current).add(tempOffset.current)

		// Calculate look-at point (forward from vehicle)
		forwardOffset.current.set(0, 0, 10)
		forwardOffset.current.applyQuaternion(tempQuat.current)
		targetLookAt.current.copy(targetPosition.current).add(forwardOffset.current)

		if (isTransitioning.current) {
			const t = state.clock.elapsedTime - transitionStartElapsed.current // 1 sec transition

			if (t >= 1) {
				isTransitioning.current = false
				sceneState.cameraPosition.copy(targetPosition.current)
				camera.lookAt(targetLookAt.current)
				camera.fov = targetFov
				camera.updateProjectionMatrix()
			} else {
				// Calculate target rotation quaternion
				dummyMatrix.current.lookAt(targetPosition.current, targetLookAt.current, UP_VECTOR)
				targetQuat.current.setFromRotationMatrix(dummyMatrix.current)

				// Lerp position, rotation, and FOV
				const alpha = 1 - Math.pow(1 - t, 3) // Ease out cubic
				const fovAlpha = 1 - Math.pow(1 - t * 0.5, 3) // Slower FOV transition
				sceneState.cameraPosition.lerpVectors(startPos.current, targetPosition.current, alpha)
				camera.quaternion.slerpQuaternions(startQuat.current, targetQuat.current, alpha)
				camera.fov = MathUtils.lerp(startFov.current, targetFov, fovAlpha)
				camera.updateProjectionMatrix()
			}
		} else {
			// Set camera position and FOV - only update projection matrix if FOV changed
			sceneState.cameraPosition.copy(targetPosition.current)
			camera.lookAt(targetLookAt.current)
			if (camera.fov !== targetFov) {
				camera.fov = targetFov
				camera.updateProjectionMatrix()
			}
		}
	})

	return null
}

export default FirstPersonCamera
