import { useRef } from 'react'
import { Vector3, MathUtils } from 'three'
import { useFrame, useThree } from '@react-three/fiber'

import { dampVector3 } from '../../../utils/dampVector3'

// Info camera controller - triggered by info mode
const InfoCamera = ({ target }) => {
	const camera = useThree((state) => state.camera)

	const currentPosition = useRef(camera.position.clone())
	const currentLookAt = useRef(new Vector3(0, 0, 0).applyQuaternion(camera.quaternion).add(camera.position))

	const targetFov = 30
	const lastFov = useRef(camera.fov)

	// Temp vectors
	const tempVec = useRef(new Vector3())
	const tempQuat = useRef(new Quaternion())
	const idealOffset = useRef(new Vector3())
	const idealLookAt = useRef(new Vector3())

	useFrame((state, delta) => {
		if (!target) return

		// Get target world position and rotation
		target.getWorldPosition(tempVec.current)
		target.getWorldQuaternion(tempQuat.current)

		// Calculate ideal camera position (Front Right)
		// Position: Right (3.5), Up (2), Forward (8.5)
		idealOffset.current.set(3.5, 2, 8.5)
		idealOffset.current.applyQuaternion(tempQuat.current)
		idealOffset.current.add(tempVec.current)

		// Calculate ideal look target (Left Front)
		// Target: Left (1), Up (0), Forward (1.5)
		idealLookAt.current.set(-1, 0, 1.5)
		idealLookAt.current.applyQuaternion(tempQuat.current)
		idealLookAt.current.add(tempVec.current)

		// Smoothly interpolate camera position and look-at
		const posLambda = 3
		const lookLambda = 4

		dampVector3(currentPosition.current, idealOffset.current, posLambda, delta)
		dampVector3(currentLookAt.current, idealLookAt.current, lookLambda, delta)

		// Smoothly transition FOV
		const newFov = MathUtils.damp(camera.fov, targetFov, 3, delta)
		if (Math.abs(newFov - lastFov.current) > 0.01) {
			camera.fov = newFov
			camera.updateProjectionMatrix()
			lastFov.current = newFov
		}

		camera.position.copy(currentPosition.current)
		camera.lookAt(currentLookAt.current)
	})

	return null
}

export default InfoCamera
