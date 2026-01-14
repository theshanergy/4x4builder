import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'

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
const CameraManager = () => {
	// Set default camera position based on aspect ratio
	const cameraConfig = useMemo(() => {
		const isPortrait = window.innerWidth / window.innerHeight < 1
		const defaultCameraPosition = isPortrait ? [-2, 1, 12] : [-4, 1, 6.5]
		return { position: defaultCameraPosition, fov: 24, near: 0.1, far: 20000 }
	}, [])

	const cameraMode = useGameStore((state) => state.cameraMode)
	const setCameraMode = useGameStore((state) => state.setCameraMode)
	const infoMode = useGameStore((state) => state.infoMode)
	const prevInfoMode = useRef(infoMode)

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

	// Select camera component based on mode
	let CameraController
	let cameraProps = {}

	if (infoMode) {
		CameraController = InfoCamera
		cameraProps = { target }
	} else {
		switch (cameraMode) {
			case CameraMode.FIRST_PERSON:
				CameraController = FirstPersonCamera
				cameraProps = { target }
				break
			case CameraMode.CHASE:
				CameraController = ChaseCamera
				cameraProps = { target }
				break
			case CameraMode.DRONE:
				CameraController = DroneCamera
				break
			case CameraMode.ORBIT:
			default:
				CameraController = OrbitCamera
				cameraProps = { transitionFromInfo: prevInfoMode.current }
		}
	}

	return (
		<>
			<PerspectiveCamera makeDefault {...cameraConfig} />
			<CameraController {...cameraProps} />
		</>
	)
}

export default CameraManager
