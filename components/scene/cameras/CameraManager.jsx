import { useRef, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

import useGameStore from '../../../store/gameStore'
import useInputStore from '../../../store/inputStore'

import OrbitCamera from './OrbitCamera'
import ChaseCamera from './ChaseCamera'
import FirstPersonCamera from './FirstPersonCamera'
import DroneCamera from './DroneCamera'
import InfoCamera from './InfoCamera'

// Custom hook to get and cache vehicle group reference with invalidation on vehicle change
const useVehicleGroup = () => {
	const scene = useThree((state) => state.scene)
	const currentVehicle = useGameStore((state) => state.currentVehicle)
	const vehicleGroupRef = useRef(null)
	const lastVehicleBody = useRef(currentVehicle.body)

	// Invalidate cache when vehicle changes
	if (currentVehicle.body !== lastVehicleBody.current) {
		vehicleGroupRef.current = null
		lastVehicleBody.current = currentVehicle.body
	}

	if (!vehicleGroupRef.current) {
		vehicleGroupRef.current = scene.getObjectByName('Vehicle')
	}

	return vehicleGroupRef.current
}

// Camera modes enum
export const CameraMode = {
	ORBIT: 'orbit',
	CHASE: 'chase',
	FIRST_PERSON: 'firstPerson',
	DRONE: 'drone',
}

// Array of available camera modes for cycling
const CAMERA_MODES = [CameraMode.ORBIT, CameraMode.CHASE, CameraMode.FIRST_PERSON, CameraMode.DRONE]

// Main camera manager - handles switching between camera modes
const CameraManager = ({ followSpeed = 8, minGroundDistance = 0.5 }) => {
	const cameraMode = useGameStore((state) => state.cameraMode)
	const setCameraMode = useGameStore((state) => state.setCameraMode)
	const infoMode = useGameStore((state) => state.infoMode)
	const prevInfoMode = useRef(infoMode)
	const camera = useThree((state) => state.camera)

	// Get target object for cameras to follow
	const target = useVehicleGroup()

	useEffect(() => {
		prevInfoMode.current = infoMode
	}, [infoMode])

	// Track key state to detect press (not hold)
	const keyPressedLastFrame = useRef(false)

	// Handle camera mode cycling with C key
	const cycleCameraMode = useCallback(() => {
		const currentIndex = CAMERA_MODES.indexOf(cameraMode)
		const nextIndex = (currentIndex + 1) % CAMERA_MODES.length
		setCameraMode(CAMERA_MODES[nextIndex])
	}, [cameraMode, setCameraMode])

	// Check for camera switch input each frame
	useFrame(() => {
		const { keys, input } = useInputStore.getState()
		// C key or Y button to cycle cameras
		const switchPressed = keys.has('c') || input.buttonY

		if (switchPressed && !keyPressedLastFrame.current) {
			cycleCameraMode()
		}
		keyPressedLastFrame.current = switchPressed
	})

	// Handle info mode
	if (infoMode) {
		return <InfoCamera target={target} />
	}

	// Render the appropriate camera controller based on current mode
	switch (cameraMode) {
		case CameraMode.FIRST_PERSON:
			return <FirstPersonCamera target={target} />
		case CameraMode.CHASE:
			return <ChaseCamera target={target} />
		case CameraMode.DRONE:
			return <DroneCamera />
		case CameraMode.ORBIT:
		default:
			return <OrbitCamera followSpeed={followSpeed} minGroundDistance={minGroundDistance} transitionFromInfo={prevInfoMode.current} />
	}
}

export default CameraManager
