import { useRef, useEffect, useMemo } from 'react'
import { Vector3, Quaternion } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { createXRStore, XR, XROrigin, useXRInputSourceState, useXR } from '@react-three/xr'

import useGameStore from '../../../store/gameStore'
import useInputStore from '../../../store/inputStore'
import vehicleConfigs from '../../../vehicleConfigs'

// Create XR store instance
const xrStore = createXRStore({
	hand: { teleportPointer: true },
	controller: { teleportPointer: true },
	emulate: false,
})

// Default XR origin position (for when not inside vehicle)
const DEFAULT_ORIGIN_POSITION = [0, 0, 5]

// Get driver position for a vehicle body, with fallback to default
const getDriverPosition = (bodyId) => {
	const vehicle = vehicleConfigs.vehicles[bodyId]
	if (vehicle?.driverPosition) {
		return new Vector3(...vehicle.driverPosition)
	}
	// Default driver position if not specified in config
	return new Vector3(0.4, 1.55, 0)
}

// XR Input Controller - polls XR controllers and updates input store via touchInput
const XRInputController = () => {
	const setTouchInput = useInputStore((state) => state.setTouchInput)

	// Get XR controller states
	const xrLeftController = useXRInputSourceState('controller', 'left')
	const xrRightController = useXRInputSourceState('controller', 'right')

	useFrame(() => {
		if (!xrLeftController && !xrRightController) return

		const xrLeftThumbstick = xrLeftController?.gamepad['xr-standard-thumbstick']
		const xrRightThumbstick = xrRightController?.gamepad['xr-standard-thumbstick']

		// Update touch input with XR controller values
		// This feeds into InputManager's touchInput which combines with other sources
		setTouchInput({
			leftStickX: xrLeftThumbstick?.xAxis ?? 0,
			leftStickY: xrLeftThumbstick?.yAxis ?? 0,
			rightStickX: xrRightThumbstick?.xAxis ?? 0,
			rightStickY: xrRightThumbstick?.yAxis ?? 0,
		})
	})

	return null
}

// XR Origin Controller - manages XR origin position to follow vehicle
const XROriginController = () => {
	const scene = useThree((state) => state.scene)
	const camera = useThree((state) => state.camera)
	const currentVehicle = useGameStore((state) => state.currentVehicle)
	const xrOriginRef = useRef(null)

	// Get driver position from vehicle config
	const driverPosition = useRef(getDriverPosition(currentVehicle.body))

	// Calibration state for user's physical head position
	const calibratedHeadOffset = useRef(null)
	const needsCalibration = useRef(true)
	const recenterPressedLastFrame = useRef(false)

	// 180 degree rotation to face forward
	const seatYawOffset = useMemo(() => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI), [])

	// Temp vectors to avoid GC
	const tempPosition = useRef(new Vector3())
	const tempQuat = useRef(new Quaternion())
	const tempOffset = useRef(new Vector3())
	const targetPosition = useRef(new Vector3())
	const headWorldPos = useRef(new Vector3())
	const originWorldPos = useRef(new Vector3())

	// Cache vehicle group reference
	const vehicleGroupRef = useRef(null)
	const lastVehicleBody = useRef(currentVehicle.body)

	// Update driver position when vehicle changes
	useEffect(() => {
		driverPosition.current = getDriverPosition(currentVehicle.body)
		vehicleGroupRef.current = null // Invalidate cache
		lastVehicleBody.current = currentVehicle.body
	}, [currentVehicle.body])

	useFrame(() => {
		if (!xrOriginRef.current) return

		// Find vehicle group (cached)
		if (!vehicleGroupRef.current || currentVehicle.body !== lastVehicleBody.current) {
			vehicleGroupRef.current = scene.getObjectByName('Vehicle')
			lastVehicleBody.current = currentVehicle.body
		}

		const vehicleGroup = vehicleGroupRef.current
		if (!vehicleGroup) {
			// No vehicle yet, use default position
			xrOriginRef.current.position.set(...DEFAULT_ORIGIN_POSITION)
			return
		}

		// Get vehicle world position and rotation
		vehicleGroup.getWorldPosition(tempPosition.current)
		vehicleGroup.getWorldQuaternion(tempQuat.current)

		// Calculate driver head position in world space
		tempOffset.current.copy(driverPosition.current)
		tempOffset.current.applyQuaternion(tempQuat.current)
		targetPosition.current.copy(tempPosition.current).add(tempOffset.current)

		// Check for recenter button (X button on controller, or auto-calibrate on first frame)
		const { input } = useInputStore.getState()
		const recenterPressed = input.buttonX
		if ((recenterPressed && !recenterPressedLastFrame.current) || needsCalibration.current) {
			// Capture the current head position relative to XR origin
			camera.getWorldPosition(headWorldPos.current)
			xrOriginRef.current.getWorldPosition(originWorldPos.current)
			calibratedHeadOffset.current = headWorldPos.current.clone().sub(originWorldPos.current)
			needsCalibration.current = false
		}
		recenterPressedLastFrame.current = recenterPressed

		// Position XR origin so user's head appears at driver position
		if (calibratedHeadOffset.current) {
			tempOffset.current.copy(calibratedHeadOffset.current)
			xrOriginRef.current.position.copy(targetPosition.current).sub(tempOffset.current)
		} else {
			xrOriginRef.current.position.copy(targetPosition.current)
		}

		// Apply chassis rotation plus 180° yaw to face forward
		xrOriginRef.current.quaternion.copy(tempQuat.current).multiply(seatYawOffset)

		// Force immediate matrix update to prevent lag
		xrOriginRef.current.updateMatrixWorld(true)
	})

	return <XROrigin ref={xrOriginRef} position={DEFAULT_ORIGIN_POSITION} />
}

// XR Session State Tracker - syncs XR session state to gameStore
const XRSessionTracker = () => {
	const setIsInXR = useGameStore((state) => state.setIsInXR)
	const isInXR = useXR((state) => state.mode !== null)

	useEffect(() => {
		setIsInXR(isInXR)
		return () => setIsInXR(false)
	}, [isInXR, setIsInXR])

	return null
}

// XR Provider component - wraps children with XR context, origin, and input handling
const XRManager = ({ children }) => {
	return (
		<XR store={xrStore}>
			<XRSessionTracker />
			<XRInputController />
			<XROriginController />
			{children}
		</XR>
	)
}

export default XRManager
