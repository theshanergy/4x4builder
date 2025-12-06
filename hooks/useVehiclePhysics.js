import { useRef, useEffect, useCallback, useMemo } from 'react'
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
	engineBrake: 0.3, // Engine braking force coefficient
	steerAngle: Math.PI / 6,
	airControl: 0.1, // Subtle air control force
}

// Speed threshold for switching to reverse (in world units per second)
const REVERSE_THRESHOLD = 0.5

// Default wheel side friction stiffness
const FRONT_WHEEL_FRICTION = 0.95
const REAR_WHEEL_FRICTION = 0.85

// Transmission simulation
const TRANSMISSION = {
	gearRatios: [0, 3.5, 2.2, 1.4, 1.0, 0.75], // 0 = neutral, 1-5 = gears
	finalDrive: 3.73,
	wheelRadius: 0.35, // meters (approximate)
	idleRpm: 850,
	maxRpm: 6200,
	redlineRpm: 5800,
	shiftUpRpm: 5500,
	shiftDownRpm: 1800,
	shiftCooldown: 0.4, // seconds between shifts to prevent gear skipping
}

// Engine torque curve - defines torque output at different RPM points
// Format: [rpm, torqueMultiplier] - multiplier is 0-1 relative to peak torque
// This simulates a typical naturally aspirated V6/V8 truck engine
// Boosted low-end for better launch feel without bogging
const TORQUE_CURVE = [
	[850, 0.65], // Idle - enough torque to get moving
	[1500, 0.78], // Just off idle - strong pull
	[2000, 0.88], // Building torque
	[2500, 0.94], // Getting into the powerband
	[3000, 0.98], // Near peak
	[3500, 1.0], // Peak torque
	[4000, 0.97], // Slight drop after peak
	[4500, 0.92], // Power takes over
	[5000, 0.85], // Upper rev range
	[5500, 0.75], // Near redline
	[6000, 0.6], // At redline - significant drop
	[6200, 0.5], // Rev limiter territory
]

// Interpolate torque curve to get torque multiplier at any RPM
const getTorqueMultiplier = (rpm) => {
	// Clamp RPM to curve bounds
	if (rpm <= TORQUE_CURVE[0][0]) return TORQUE_CURVE[0][1]
	if (rpm >= TORQUE_CURVE[TORQUE_CURVE.length - 1][0]) return TORQUE_CURVE[TORQUE_CURVE.length - 1][1]

	// Find the two points to interpolate between
	for (let i = 0; i < TORQUE_CURVE.length - 1; i++) {
		const [rpm1, torque1] = TORQUE_CURVE[i]
		const [rpm2, torque2] = TORQUE_CURVE[i + 1]
		if (rpm >= rpm1 && rpm <= rpm2) {
			const t = (rpm - rpm1) / (rpm2 - rpm1)
			return torque1 + t * (torque2 - torque1)
		}
	}
	return 1.0
}

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

	// Track reset button state to detect press (not hold)
	const resetPressedLastFrame = useRef(false)

	// Track current friction stiffness for smooth drift transitions
	const currentRearWheelFriction = useRef(null)

	// Reusable objects to avoid GC pressure
	const tempVelocity = useMemo(() => new Vector3(), [])
	const tempForward = useMemo(() => new Vector3(), [])
	const tempLocalTorque = useMemo(() => new Vector3(), [])
	const tempWorldTorque = useMemo(() => new Vector3(), [])
	const tempQuat = useMemo(() => new Quaternion(), [])
	const wheelQuat1 = useMemo(() => new Quaternion(), [])
	const wheelQuat2 = useMemo(() => new Quaternion(), [])

	// Engine load tracking
	const smoothedLoad = useRef(0.5)

	// Drivetrain angular velocity (rad/s) - single source of truth for wheel spin
	const drivetrainAngularVel = useRef(TRANSMISSION.idleRpm * ((2 * Math.PI) / 60))

	// Shift cooldown timer to prevent gear skipping
	const lastShiftTime = useRef(0)

	// Smoothed keyboard steering for lerping
	const smoothedKeyboardSteering = useRef(0)

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

		// Reset gear to first
		useGameStore.getState().engineRef.gear = 1
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
			// Only set reduced side friction for rear wheels (indices 2 and 3)
			if (index < 2) {
				vehicle.setWheelSideFrictionStiffness(index, FRONT_WHEEL_FRICTION)
			} else {
				vehicle.setWheelSideFrictionStiffness(index, REAR_WHEEL_FRICTION)
			}
		})

		// Store controller reference
		vehicleController.current = vehicle

		// Initialize rear wheel friction tracking for drift mode
		if (currentRearWheelFriction.current === null) {
			currentRearWheelFriction.current = REAR_WHEEL_FRICTION
		}

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

			// Apply steering and rotation using reusable quaternions
			wheelQuat1.setFromAxisAngle(VECTORS.UP, steering)
			wheelQuat2.setFromAxisAngle(wheelAxleCs, rotation)
			wheelRef.quaternion.multiplyQuaternions(wheelQuat1, wheelQuat2)
		})

		// Update airborne state
		const newAirborneState = wheelsInContact === 0
		if (newAirborneState !== isAirborne.current) {
			isAirborne.current = newAirborneState
		}
	})

	// Handle input forces each frame
	useFrame((state, delta) => {
		if (!vehicleController.current) return

		// Get input from store
		const { keys, input } = useInputStore.getState()

		// Check for reset input (R key or Y button) - trigger on press, not hold
		const resetPressed = keys.has('r') || keys.has('R') || input.buttonY
		if (resetPressed && !resetPressedLastFrame.current) {
			resetVehicle()
		}
		resetPressedLastFrame.current = resetPressed

		// Handle drift mode (Shift key) with smooth transition
		const isDrifting = keys.has('Shift')
		const targetFriction = isDrifting ? 0.1 : REAR_WHEEL_FRICTION

		// Smoothly interpolate friction with different rates for entering/exiting drift
		// Faster transition into drift (0.15), slower transition out (0.05) for smoother recovery
		const lerpFactor = isDrifting ? 0.15 : 0.0015
		if (currentRearWheelFriction.current === null) {
			currentRearWheelFriction.current = targetFriction
		} else {
			currentRearWheelFriction.current += (targetFriction - currentRearWheelFriction.current) * lerpFactor
		}

		// Apply side friction to rear wheels (indices 2 and 3)
		if (wheels.length > 2) vehicleController.current.setWheelSideFrictionStiffness(2, currentRearWheelFriction.current)
		if (wheels.length > 3) vehicleController.current.setWheelSideFrictionStiffness(3, currentRearWheelFriction.current)

		const clamp = (value) => Math.min(1, Math.max(-1, value))

		// Calculate raw input values
		const throttleInput = clamp((keys.has('ArrowUp') || keys.has('w') || keys.has('W') ? 1 : 0) + (input.rightStickY < 0 ? -input.rightStickY : 0))
		const brakeInput = clamp((keys.has('ArrowDown') || keys.has('s') || keys.has('S') ? 1 : 0) + (input.rightStickY > 0 ? input.rightStickY : 0))

		// Get current vehicle speed (forward velocity) - needed for speed-based steering
		const vehicle = vehicleRef.current
		let forwardSpeed = 0
		if (vehicle) {
			const velocity = vehicle.linvel()
			tempForward.copy(VECTORS.FORWARD).applyQuaternion(vehicle.rotation())
			tempVelocity.set(velocity.x, velocity.y, velocity.z)
			forwardSpeed = tempVelocity.dot(tempForward)

			// Update speed ref for UI (mutate ref directly to avoid re-renders)
			useGameStore.getState().vehicleSpeedRef.current = forwardSpeed
		}

		// Calculate keyboard steering target (-1, 0, or 1)
		const keyboardSteerTarget = (keys.has('ArrowRight') || keys.has('d') || keys.has('D') ? -1 : 0) + (keys.has('ArrowLeft') || keys.has('a') || keys.has('A') ? 1 : 0)

		// Speed-based steering lerp: slower response at higher speeds for better handling
		// At 0 speed: fast response (8 for centering, 5 for turning)
		// At high speed (~25 units/s): slower response (2 for centering, 1.2 for turning)
		const speedFactor = Math.min(1, Math.abs(forwardSpeed) / 25) // Normalize speed (0 to 1)
		const baseLerpSpeed = keyboardSteerTarget === 0 ? 8 : 5
		const minLerpSpeed = keyboardSteerTarget === 0 ? 2 : 1.2
		const steerLerpSpeed = baseLerpSpeed - (baseLerpSpeed - minLerpSpeed) * speedFactor

		smoothedKeyboardSteering.current += (keyboardSteerTarget - smoothedKeyboardSteering.current) * Math.min(1, steerLerpSpeed * delta)

		// Combine smoothed keyboard steering with analog stick input
		const steerForce = FORCES.steerAngle * clamp(smoothedKeyboardSteering.current + -input.leftStickX)

		// ===== ENGINE & TRANSMISSION SIMULATION =====
		// Physics-based approach: drivetrain has rotational inertia
		// Forces act on it: throttle accelerates, friction/load decelerates

		const engineRef = useGameStore.getState().engineRef
		const absSpeed = Math.abs(forwardSpeed)

		// Convert current drivetrain angular velocity to RPM for gear logic
		const currentAngularVel = drivetrainAngularVel.current
		const currentRpmFromDrivetrain = (currentAngularVel * 60) / (2 * Math.PI)

		// Get current gear
		let currentGear = engineRef.gear
		const gearRatio = TRANSMISSION.gearRatios[currentGear] || 1
		const totalRatio = gearRatio * TRANSMISSION.finalDrive

		// Calculate what wheel angular velocity would give us based on ground speed
		const groundWheelAngularVel = absSpeed / TRANSMISSION.wheelRadius
		const groundEngineAngularVel = groundWheelAngularVel * totalRatio

		// Track time for shift cooldown
		const currentTime = performance.now() / 1000

		// Automatic transmission logic (based on current RPM)
		// Don't shift gears while airborne - maintain current gear until wheels touch ground
		// Use cooldown to prevent skipping gears (e.g., 1 -> 3 -> 5)
		const canShift = currentTime - lastShiftTime.current > TRANSMISSION.shiftCooldown

		if (!isAirborne.current && engineRef.gear !== -1) {
			if (canShift && currentRpmFromDrivetrain > TRANSMISSION.shiftUpRpm && currentGear < TRANSMISSION.gearRatios.length - 1 && throttleInput > 0.3) {
				currentGear++
				engineRef.gear = currentGear
				lastShiftTime.current = currentTime
			} else if (canShift && currentRpmFromDrivetrain < TRANSMISSION.shiftDownRpm && currentGear > 1 && absSpeed > 0.5) {
				currentGear--
				engineRef.gear = currentGear
				lastShiftTime.current = currentTime
			} else if (absSpeed < 0.5) {
				currentGear = 1
				engineRef.gear = 1
			}
		}

		// Drivetrain inertia simulation
		// Units: angular acceleration in rad/s²
		const idleAngularVel = TRANSMISSION.idleRpm * ((2 * Math.PI) / 60)
		const maxAngularVel = TRANSMISSION.maxRpm * ((2 * Math.PI) / 60)

		// Calculate forces acting on drivetrain
		let angularAccel = 0

		// Inertia depends on what's connected:
		// - Engine/flywheel: always present
		// - Transmission/driveshaft/wheels: adds significant inertia when grounded
		// When airborne, we're only spinning the drivetrain against minimal resistance
		const baseInertia = 0.15 // Engine + flywheel + transmission internals
		const wheelInertia = 1.0 // Wheels + driveshaft + differential
		const drivetrainInertia = isAirborne.current ? baseInertia : baseInertia + wheelInertia

		// 1. Throttle force - engine torque using realistic torque curve
		const rpmNormalized = (currentAngularVel - idleAngularVel) / (maxAngularVel - idleAngularVel)
		const torqueFromCurve = getTorqueMultiplier(currentRpmFromDrivetrain)
		const throttleForce = throttleInput * 25.0 * torqueFromCurve
		angularAccel += throttleForce / drivetrainInertia

		// 2. Internal engine friction - always present
		// Includes pumping losses, bearing friction, accessory load
		// Scales with RPM but starts low at idle
		const frictionBase = 0.3 // Base friction at idle
		const frictionRpmScale = 1.5 // Additional friction at max RPM
		const internalFriction = frictionBase + rpmNormalized * frictionRpmScale
		angularAccel -= internalFriction / drivetrainInertia

		// 3. Ground coupling - when wheels touch ground, engine RPM is linked to wheel speed
		// This naturally handles both acceleration (engine speeds up wheels) and
		// engine braking (wheels slow down engine when coasting)
		// The coupling stiffness is modulated by tire grip - less grip = less coupling = wheelspin
		if (!isAirborne.current) {
			// Base coupling stiffness when tires have full grip
			const baseCouplingStiffness = 12.0

			// Asymmetric coupling:
			// - When engine wants to spin faster than wheels (throttle/acceleration): coupling reduced by friction
			// - When wheels want to spin engine faster (engine braking/decel): maintain stronger coupling
			const velocityError = groundEngineAngularVel - currentAngularVel

			let couplingStiffness
			if (velocityError < 0 && throttleInput > 0.1) {
				// Engine is spinning faster than ground speed and we're on throttle
				// This is wheelspin territory - reduce coupling based on friction
				// Lower friction = engine can overpower tire grip = wheelspin
				couplingStiffness = baseCouplingStiffness * currentRearWheelFriction.current * currentRearWheelFriction.current
			} else {
				// Engine braking or not on throttle - maintain normal coupling
				couplingStiffness = baseCouplingStiffness
			}

			angularAccel += (velocityError * couplingStiffness) / drivetrainInertia
		}

		// 4. Idle air control - maintains minimum RPM to prevent stalling
		// Works the same whether airborne or grounded - just maintains idle
		if (currentAngularVel < idleAngularVel && throttleInput < 0.1) {
			const idleCorrection = (idleAngularVel - currentAngularVel) * 5.0
			angularAccel += idleCorrection / drivetrainInertia
		}

		// Integrate angular velocity (simple Euler)
		const dt = 1 / 60 // Approximate frame time
		drivetrainAngularVel.current += angularAccel * dt

		// Clamp to valid range
		drivetrainAngularVel.current = Math.max(idleAngularVel * 0.9, Math.min(maxAngularVel, drivetrainAngularVel.current))

		// Convert back to RPM for audio system
		engineRef.rpm = (drivetrainAngularVel.current * 60) / (2 * Math.PI)

		// Clamp RPM
		engineRef.rpm = Math.max(TRANSMISSION.idleRpm, Math.min(TRANSMISSION.maxRpm, engineRef.rpm))

		// ===== ENGINE LOAD CALCULATION =====
		// Load represents resistance the engine is fighting against
		// Derived from the actual physics: how much is the drivetrain being slowed by external forces?

		// Base load from internal friction (always present)
		let engineLoad = 0.1

		// Throttle application under any resistance = load
		if (throttleInput > 0.05) {
			// How much throttle vs how much the engine is actually accelerating
			// If throttle is high but RPM isn't climbing, engine is loaded
			const rpmNorm = (engineRef.rpm - TRANSMISSION.idleRpm) / (TRANSMISSION.maxRpm - TRANSMISSION.idleRpm)

			// Throttle-based load - pressing throttle means engine is working
			engineLoad += throttleInput * 0.4

			// Low RPM under throttle = engine struggling against resistance
			engineLoad += throttleInput * (1 - rpmNorm) * 0.3

			// Speed-based load (air/rolling resistance increases with speed)
			engineLoad += Math.min(0.2, absSpeed * 0.01)

			// When airborne, load is much lower since we're not fighting ground resistance
			if (isAirborne.current) {
				engineLoad *= 0.4
			}
		}

		// Clamp to valid range
		engineLoad = Math.max(0.05, Math.min(1.0, engineLoad))

		// Smooth load transitions to avoid jarring audio changes
		const loadLerpSpeed = 0.08
		smoothedLoad.current += (engineLoad - smoothedLoad.current) * loadLerpSpeed

		// Store for audio system
		engineRef.load = smoothedLoad.current

		// Store throttle for audio
		engineRef.throttle = throttleInput

		// Determine reverse state
		// Enter reverse: braking while nearly stopped and not accelerating
		// Exit reverse: accelerating (throttle pressed)
		if (throttleInput > 0 && engineRef.gear === -1) {
			engineRef.gear = 1
		} else if (brakeInput > 0 && Math.abs(forwardSpeed) < REVERSE_THRESHOLD) {
			engineRef.gear = -1
		}

		// Calculate actual forces based on state
		let engineForce = 0
		let brakeForce = 0

		if (engineRef.gear === -1) {
			// In reverse mode: brake input drives backward
			engineForce = -FORCES.reverse * brakeInput
			// Throttle acts as brake when reversing
			brakeForce = FORCES.brake * throttleInput
		} else {
			// Normal forward mode
			if (throttleInput > 0) {
				// Get torque multiplier from curve based on current RPM
				const torqueMultiplier = getTorqueMultiplier(engineRef.rpm)

				// Get current gear ratio (higher ratio = more torque multiplication)
				const currentGearRatio = TRANSMISSION.gearRatios[currentGear] || 1

				// Calculate wheel force:
				// Engine torque * gear ratio * final drive / wheel radius = wheel force
				// We normalize by first gear ratio so the base force is tuned for gameplay
				const gearMultiplier = currentGearRatio / TRANSMISSION.gearRatios[1]

				// Combined force: base * throttle * torque curve * gear advantage
				engineForce = FORCES.accelerate * throttleInput * torqueMultiplier * gearMultiplier
			} else if (forwardSpeed > 1.0) {
				// Engine braking when coasting forward
				const gearRatio = TRANSMISSION.gearRatios[currentGear] || 1
				const rpmFactor = Math.max(0, (engineRef.rpm - TRANSMISSION.idleRpm) / (TRANSMISSION.maxRpm - TRANSMISSION.idleRpm))

				// Calculate braking force based on RPM and gear ratio
				// Higher RPM and lower gear (higher ratio) = more braking
				const brakingForce = FORCES.engineBrake * rpmFactor * gearRatio * TRANSMISSION.finalDrive

				// Apply as negative engine force (opposing forward motion)
				engineForce = -brakingForce
			} else {
				engineForce = 0
			}

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
				const pitch = clamp(
					(keys.has('ArrowUp') || keys.has('w') || keys.has('W') ? -1 : 0) + (keys.has('ArrowDown') || keys.has('s') || keys.has('S') ? 1 : 0) - input.leftStickY
				)
				const roll = clamp(
					(keys.has('ArrowLeft') || keys.has('a') || keys.has('A') ? -1 : 0) + (keys.has('ArrowRight') || keys.has('d') || keys.has('D') ? 1 : 0) + input.leftStickX
				)
				const yaw = clamp(-input.rightStickX)

				// Construct torque vector in world space using reusable objects
				tempLocalTorque.set(pitch, yaw, roll)
				tempQuat.copy(vehicle.rotation())
				tempWorldTorque.copy(tempLocalTorque).applyQuaternion(tempQuat).multiplyScalar(FORCES.airControl)

				// Apply impulse
				vehicle.applyTorqueImpulse(tempWorldTorque, true)
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
