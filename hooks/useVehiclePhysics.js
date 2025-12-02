import { useRef, useEffect, useCallback } from 'react'
import { useRapier, useAfterPhysicsStep } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import { Vector3, Quaternion } from 'three'

import useGameStore from '../store/gameStore'
import useInputStore from '../store/inputStore'

// Reset position (scene center, slightly above ground)
const RESET_POSITION = { x: 0, y: 1, z: 0 }
// Upright rotation (identity quaternion)
const RESET_ROTATION = { x: 0, y: 0, z: 0, w: 1 }

// Constants
const VECTORS = {
	UP: new Vector3(0, 1, 0),
	RIGHT: new Vector3(1, 0, 0),
	DOWN: new Vector3(0, -1, 0),
	FORWARD: new Vector3(0, 0, 1),
}

// Physics
const FORCES = {
	accelerate: 30,
	reverse: 15, // Reverse is typically slower than forward
	brake: 0.5,
	steerAngle: Math.PI / 6,
	airControl: 0.1, // Subtle air control force
}

// Speed threshold for switching to reverse (in world units per second)
const REVERSE_THRESHOLD = 0.5

/**
 * Generic vehicle physics hook for wheeled vehicles
 * @param {Object} vehicleRef - Reference to the vehicle rigid body
 * @param {Array} wheels - Array of wheel configurations with refs and positions
 * @returns {Object} - Vehicle controller
 */
export const useVehiclePhysics = (vehicleRef, wheels) => {
	const { world } = useRapier()

	// Refs
	const vehicleController = useRef()

	// Track airborne state
	const isAirborne = useRef(false)

	// Track reverse state
	const isReversing = useRef(false)

	// Track reset button state to detect press (not hold)
	const resetPressedLastFrame = useRef(false)

	// Reset vehicle function
	const resetVehicle = useCallback(() => {
		const vehicle = vehicleRef.current
		if (!vehicle) return

		// Reset position to scene center
		vehicle.setTranslation(RESET_POSITION, true)

		// Reset rotation to upright
		vehicle.setRotation(RESET_ROTATION, true)

		// Reset velocities
		vehicle.setLinvel({ x: 0, y: 0, z: 0 }, true)
		vehicle.setAngvel({ x: 0, y: 0, z: 0 }, true)

		// Reset reverse state
		isReversing.current = false
	}, [vehicleRef])

	// Setup vehicle physics
	useEffect(() => {
		if (!vehicleRef.current) return

		// Create vehicle controller
		const vehicle = world.createVehicleController(vehicleRef.current)

		// Set the vehicle's forward axis to Z (index 2)
		// This makes the forward direction perpendicular to the wheel axle direction
		vehicle.setIndexForwardAxis = 2

		// Add and configure wheels
		wheels.forEach((wheel, index) => {
			vehicle.addWheel(wheel.position, wheel.suspensionDirection || VECTORS.DOWN, wheel.axleCs || VECTORS.RIGHT, wheel.suspensionRestLength || 0.05, wheel.radius)
			vehicle.setWheelSuspensionStiffness(index, wheel.suspensionStiffness || 20)
			vehicle.setWheelMaxSuspensionTravel(index, wheel.maxSuspensionTravel || 0.23)
			vehicle.setWheelSuspensionCompression(index, wheel.suspensionCompression || 2.3)
			vehicle.setWheelSuspensionRelaxation(index, wheel.suspensionRebound || 3.4)
		})

		// Store controller reference
		vehicleController.current = vehicle

		return () => {
			if (vehicleController.current) {
				world.removeVehicleController(vehicle)
				vehicleController.current = null
			}
		}
	}, [vehicleRef, wheels, world])

	// Update wheel positions after physics step
	useAfterPhysicsStep((world) => {
		const controller = vehicleController.current
		if (!controller) return

		// Update the vehicle with safe timestep
		controller.updateVehicle(world.timestep)

		// Check if all wheels are not in contact with the ground (airborne)
		let wheelsInContact = 0

		// Update each wheel
		wheels.forEach((wheel, index) => {
			const wheelRef = wheel.ref.current
			if (!wheelRef) return

			// Get wheel data with fallbacks
			const wheelAxleCs = controller.wheelAxleCs(index) || VECTORS.RIGHT
			const connection = controller.wheelChassisConnectionPointCs(index)
			const suspension = controller.wheelSuspensionLength(index) || 0
			const steering = controller.wheelSteering(index) || 0
			const rotation = controller.wheelRotation(index) || 0

			// Check if the wheel is in contact with the ground
			if (controller.wheelIsInContact(index)) {
				wheelsInContact++
			}

			// Update position
			wheelRef.position.y = connection?.y - suspension

			// Apply steering and rotation
			wheelRef.quaternion.multiplyQuaternions(new Quaternion().setFromAxisAngle(VECTORS.UP, steering), new Quaternion().setFromAxisAngle(wheelAxleCs, rotation))
		})

		// Update airborne state
		const newAirborneState = wheelsInContact === 0
		if (newAirborneState !== isAirborne.current) {
			isAirborne.current = newAirborneState
		}
	})

	// Handle input forces each frame
	useFrame(() => {
		if (!vehicleController.current) return

		// Get input from store
		const { keys, input } = useInputStore.getState()

		// Check for reset input (R key or Y button) - trigger on press, not hold
		const resetPressed = keys.has('r') || keys.has('R') || input.buttonY
		if (resetPressed && !resetPressedLastFrame.current) {
			resetVehicle()
		}
		resetPressedLastFrame.current = resetPressed

		const clamp = (value) => Math.min(1, Math.max(-1, value))

		// Calculate raw input values
		const throttleInput = clamp((keys.has('ArrowUp') ? 1 : 0) + (input.rightStickY < 0 ? -input.rightStickY : 0))
		const brakeInput = clamp((keys.has('ArrowDown') ? 1 : 0) + (input.rightStickY > 0 ? input.rightStickY : 0))
		const steerForce = FORCES.steerAngle * clamp((keys.has('ArrowRight') ? -1 : 0) + (keys.has('ArrowLeft') ? 1 : 0) + -input.leftStickX)

		// Get current vehicle speed (forward velocity)
		const vehicle = vehicleRef.current
		let forwardSpeed = 0
		if (vehicle) {
			const velocity = vehicle.linvel()
			const forward = VECTORS.FORWARD.clone().applyQuaternion(vehicle.rotation())
			forwardSpeed = new Vector3(velocity.x, velocity.y, velocity.z).dot(forward)
		}

		// Determine reverse state
		// Enter reverse: braking while nearly stopped and not accelerating
		// Exit reverse: accelerating (throttle pressed)
		if (throttleInput > 0) {
			isReversing.current = false
		} else if (brakeInput > 0 && Math.abs(forwardSpeed) < REVERSE_THRESHOLD) {
			isReversing.current = true
		}

		// Calculate actual forces based on state
		let engineForce = 0
		let brakeForce = 0

		if (isReversing.current) {
			// In reverse mode: brake input drives backward
			engineForce = -FORCES.reverse * brakeInput
			// Throttle acts as brake when reversing
			brakeForce = FORCES.brake * throttleInput
		} else {
			// Normal forward mode
			engineForce = FORCES.accelerate * throttleInput
			brakeForce = FORCES.brake * brakeInput
		}

		if (!isAirborne.current) {
			// Front wheels steering (assuming first two wheels are front)
			for (let i = 0; i < 2 && i < wheels.length; i++) {
				vehicleController.current.setWheelSteering(i, steerForce)
			}

			// Rear wheels driving (assuming last two wheels are rear)
			for (let i = 2; i < 4 && i < wheels.length; i++) {
				vehicleController.current.setWheelEngineForce(i, -engineForce)
			}

			// All wheels braking
			for (let i = 0; i < wheels.length; i++) {
				vehicleController.current.setWheelBrake(i, brakeForce)
			}
		} else {
			// Airborne controls when all wheels are not in contact
			const vehicle = vehicleRef.current
			if (vehicle) {
				const pitch = clamp((keys.has('ArrowUp') ? -1 : 0) + (keys.has('ArrowDown') ? 1 : 0) - input.leftStickY)
				const roll = clamp((keys.has('ArrowLeft') ? -1 : 0) + (keys.has('ArrowRight') ? 1 : 0) + input.leftStickX)
				const yaw = clamp(-input.rightStickX)

				// Construct torque vector in world space
				const localTorque = new Vector3(pitch, yaw, roll)
				const worldTorque = localTorque.applyQuaternion(new Quaternion().copy(vehicle.rotation()))

				// Apply impulse
				vehicle.applyTorqueImpulse(worldTorque.multiplyScalar(FORCES.airControl), true)
			}
		}

		// Enable physics if not already enabled
		if (!useGameStore.getState().physicsEnabled && (throttleInput || brakeInput)) {
			useGameStore.getState().setPhysicsEnabled(true)
		}
	})

	// Return the vehicleController ref and control functions
	return {
		vehicleController,
		resetVehicle,
	}
}

export default useVehiclePhysics
