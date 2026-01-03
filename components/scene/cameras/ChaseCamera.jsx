import { useRef } from 'react'
import { Vector3, MathUtils, Quaternion } from 'three'
import { useFrame, useThree } from '@react-three/fiber'

import { dampVector3 } from '../../../utils/dampVector3'
import { useGroundAvoidance } from '../../../hooks/useGroundAvoidance'

// Chase camera controller
const ChaseCamera = ({ target }) => {
	const camera = useThree((state) => state.camera)

	const currentPosition = useRef(camera.position.clone())
	const currentLookAt = useRef(new Vector3(0, 0, -10).applyQuaternion(camera.quaternion).add(camera.position))

	const minGroundDistance = 0.5
	const targetFov = 24 // Default FOV for chase camera
	const lastFov = useRef(camera.fov)

	// Temp vectors
	const tempVec = useRef(new Vector3())
	const tempQuat = useRef(new Quaternion())
	const idealOffset = useRef(new Vector3())
	const idealLookAt = useRef(new Vector3())

	// Use shared ground avoidance hook - pass idealLookAt as target for midpoint sampling
	const checkGroundAvoidance = useGroundAvoidance(currentPosition, minGroundDistance, idealLookAt)

	useFrame((state, delta) => {
		if (!target) return

		// Get target world position and rotation
		target.getWorldPosition(tempVec.current)
		target.getWorldQuaternion(tempQuat.current)

		// Calculate ideal camera position (behind and up)
		idealOffset.current.set(0, 3.5, -8)
		idealOffset.current.applyQuaternion(tempQuat.current)
		idealOffset.current.add(tempVec.current)

		// Calculate ideal look target (slightly ahead of vehicle)
		idealLookAt.current.set(0, 1.5, 5)
		idealLookAt.current.applyQuaternion(tempQuat.current)
		idealLookAt.current.add(tempVec.current)

		// Smoothly interpolate camera position and look-at
		// Lower lambda = more lag/smoothing
		const posLambda = 4
		const lookLambda = 6

		dampVector3(currentPosition.current, idealOffset.current, posLambda, delta)
		dampVector3(currentLookAt.current, idealLookAt.current, lookLambda, delta)

		// Smoothly transition FOV back to default - only update projection matrix when FOV changes
		const newFov = MathUtils.damp(camera.fov, targetFov, 3, delta)
		if (Math.abs(newFov - lastFov.current) > 0.01) {
			camera.fov = newFov
			camera.updateProjectionMatrix()
			lastFov.current = newFov
		}

		// Ground avoidance logic using shared hook
		checkGroundAvoidance()

		camera.position.copy(currentPosition.current)
		camera.lookAt(currentLookAt.current)
	})

	return null
}

export default ChaseCamera
