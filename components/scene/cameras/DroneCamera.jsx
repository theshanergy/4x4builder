import { useRef, useEffect } from 'react'
import { Vector3, MathUtils, Euler } from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import Drone from '../drone/Drone'

// Drone camera wrapper that follows the drone
// The drone itself handles all input, physics, and movement
const DroneCamera = () => {
	const camera = useThree((state) => state.camera)

	// Camera state
	const currentPosition = useRef(new Vector3(0, 0, 0))
	const currentVelocity = useRef(new Vector3(0, 0, 0))
	const droneYaw = useRef(0)
	const dronePitch = useRef(0)
	const lastFov = useRef(camera.fov)
	const originalNear = useRef(camera.near)

	// Set lower near clipping plane for drone mode to allow close-up views
	useEffect(() => {
		originalNear.current = camera.near
		camera.near = 0.01
		camera.updateProjectionMatrix()

		return () => {
			camera.near = originalNear.current
			camera.updateProjectionMatrix()
		}
	}, [camera])

	// Camera config
	const config = {
		targetFov: 60,
		verticalOffset: 0.1, // Offset camera slightly above drone
	}

	// Callbacks for drone to update camera
	const handlePositionUpdate = (position, velocity) => {
		currentPosition.current.copy(position)
		currentVelocity.current.copy(velocity)
	}

	const handleRotationUpdate = (rotation, tilt) => {
		// Extract yaw and pitch from drone rotation for camera control
		droneYaw.current = rotation.y
		dronePitch.current = rotation.x
	}

	useFrame((state, delta) => {
		const dt = Math.min(delta, 0.1)

		// Update camera position to follow drone with vertical offset
		camera.position.copy(currentPosition.current)
		camera.position.y -= config.verticalOffset

		// Apply pitch (look up/down) and yaw (turn left/right) to camera
		// Pitch is controlled by mouse Y, yaw is controlled by mouse X
		camera.rotation.set(dronePitch.current, droneYaw.current, 0, 'YXZ')

		// Smoothly transition FOV
		const newFov = MathUtils.damp(camera.fov, config.targetFov, 3, dt)
		if (Math.abs(newFov - lastFov.current) > 0.01) {
			camera.fov = newFov
			camera.updateProjectionMatrix()
			lastFov.current = newFov
		}
	})

	return <Drone onPositionUpdate={handlePositionUpdate} onRotationUpdate={handleRotationUpdate} />
}

export default DroneCamera
