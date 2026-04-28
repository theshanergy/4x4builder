import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, Vector3, Euler } from 'three'
import DroneAudio from './DroneAudio'
import { useDroneInput } from '../../../hooks/useDroneInput'
import useElevationBounds from '../../../hooks/useElevationBounds'
import useGameStore, { vehicleState } from '../../../store/gameStore'

// Visual drone model with arms and spinning propellers
// Manages its own physics, input, and movement
const Drone = ({ onPositionUpdate, onRotationUpdate }) => {
	const propRefs = useRef([])
	const groupRef = useRef()
	const droneTilt = useRef({ pitch: 0, roll: 0 })
	const position = useRef(new Vector3(0, 0, 0))
	const velocity = useRef(new Vector3(0, 0, 0))
	const euler = useRef(new Euler(0, vehicleState.heading + Math.PI, 0, 'YXZ')) // Initialize yaw to face vehicle (opposite of vehicle heading)
	const defaultPitch = useRef(-0.2) // Default vertical angle to return to (-0.2 radians ≈ -11 degrees)
	const hasLaunched = useRef(false) // Track if we've done the initial launch

	// Movement config
	const config = {
		// Movement speeds
		moveSpeed: 20, // Horizontal movement speed
		boostMultiplier: 2.5, // Speed multiplier when boosting
		verticalSpeed: 30, // Vertical movement speed
		acceleration: 2, // How fast we lerp to target speed

		// Tilt (visual only)
		maxTiltAngle: 0.5, // Max tilt in radians (~29 degrees)
		tiltSpeed: 3, // How fast drone tilts
		tiltRecovery: 4, // How fast drone returns to level

		// Rotation
		yawSpeed: 2, // Rotation speed around vertical axis
		mouseSensitivity: 0.002,
		gamepadLookSensitivity: 2.5,
		rotationReturnSpeed: 2, // Speed at which camera returns to default angle when unlocked

		// Limits
		minElevation: 1.0,
		maxElevation: 1000, // Maximum height above terrain (meters)

		// Default pitch
		defaultPitch: defaultPitch.current,
	}

	// Initialize position at vehicle center on mount
	useEffect(() => {
		// Enable physics if not already enabled
		if (!useGameStore.getState().physicsEnabled) {
			useGameStore.getState().setPhysicsEnabled(true)
		}

		// Position at vehicle center
		position.current.set(vehicleState.position.x, vehicleState.position.y, vehicleState.position.z)

		// Add velocity in opposite direction of vehicle heading (backward) and upward
		const backwardSpeed = 25 // Horizontal speed away from vehicle
		const upwardSpeed = 10 // Upward velocity for smooth launch

		// Calculate backward direction (opposite of vehicle heading)
		const backwardAngle = vehicleState.heading - Math.PI
		velocity.current.x = Math.sin(backwardAngle) * backwardSpeed
		velocity.current.y = upwardSpeed
		velocity.current.z = Math.cos(backwardAngle) * backwardSpeed

		hasLaunched.current = true
	}, [])

	// Elevation bounds - handles both ground avoidance and ceiling limit
	const checkElevationBounds = useElevationBounds(position, config.minElevation, config.maxElevation, null, velocity)

	// Input handling
	const { processInput } = useDroneInput(config, euler)

	// Animate propellers and update drone physics
	useFrame((state, delta) => {
		const dt = Math.min(delta, 0.1)

		// Process input
		const input = processInput(dt)

		// Apply yaw rotation
		euler.current.y += input.yaw * config.yawSpeed * dt

		// Apply speed boost if shift is held
		const currentMoveSpeed = input.isBoosting ? config.moveSpeed * config.boostMultiplier : config.moveSpeed
		const currentVerticalSpeed = input.isBoosting ? config.verticalSpeed * config.boostMultiplier : config.verticalSpeed

		// Calculate movement direction on horizontal plane (ignores camera pitch)
		const yaw = euler.current.y

		// Forward direction on horizontal plane (where drone yaw is pointing)
		const forwardX = -Math.sin(yaw)
		const forwardZ = -Math.cos(yaw)

		// Right direction (perpendicular to forward, on horizontal plane)
		const rightX = Math.cos(yaw)
		const rightZ = -Math.sin(yaw)

		// Calculate target velocity from inputs
		// W/S: Forward/back on horizontal plane
		// A/D: Strafe left/right
		// Q/E or Arrow Up/Down: Vertical movement (throttle)
		const targetVelX = (forwardX * input.pitch + rightX * input.strafe) * currentMoveSpeed
		const targetVelY = input.throttle * currentVerticalSpeed
		const targetVelZ = (forwardZ * input.pitch + rightZ * input.strafe) * currentMoveSpeed

		// Lerp velocity towards target
		velocity.current.x = MathUtils.lerp(velocity.current.x, targetVelX, config.acceleration * dt)
		velocity.current.z = MathUtils.lerp(velocity.current.z, targetVelZ, config.acceleration * dt)
		velocity.current.y = MathUtils.lerp(velocity.current.y, targetVelY, config.acceleration * dt)

		// Calculate tilt based on velocity
		// Strafe (Roll)
		const strafeVelocity = velocity.current.x * rightX + velocity.current.z * rightZ
		const normalizedStrafeVel = MathUtils.clamp(strafeVelocity / currentMoveSpeed, -1, 1)
		const rollTarget = normalizedStrafeVel * config.maxTiltAngle

		// Forward (Pitch) - Tilt forward (negative X) when moving forward
		const forwardVelocity = velocity.current.x * forwardX + velocity.current.z * forwardZ
		const normalizedForwardVel = MathUtils.clamp(forwardVelocity / currentMoveSpeed, -1, 1)
		const pitchTarget = -normalizedForwardVel * config.maxTiltAngle // Negative for nose down

		// Smoothly interpolate tilt
		droneTilt.current.pitch = MathUtils.lerp(droneTilt.current.pitch, pitchTarget, config.tiltSpeed * dt)
		droneTilt.current.roll = MathUtils.lerp(droneTilt.current.roll, -rollTarget, config.tiltSpeed * dt)

		// Apply velocity to position
		position.current.x += velocity.current.x * dt
		position.current.y += velocity.current.y * dt
		position.current.z += velocity.current.z * dt

		// Enforce elevation bounds (ground and ceiling)
		checkElevationBounds()

		// Notify parent of position and rotation updates
		if (onPositionUpdate) {
			onPositionUpdate(position.current, velocity.current)
		}
		if (onRotationUpdate) {
			onRotationUpdate(euler.current, droneTilt.current)
		}

		// Calculate velocity magnitude for propeller speed
		const velocityMagnitude = velocity.current.length()

		// Base spin speed, increases with velocity
		const baseSpeed = 20
		const velocityBoost = Math.abs(velocityMagnitude) * 2
		const spinSpeed = baseSpeed + velocityBoost

		propRefs.current.forEach((prop, i) => {
			if (prop) {
				// Alternate spin direction for standard quadcopter physics
				// 0: CW, 1: CCW, 2: CW, 3: CCW
				const dir = i % 2 === 0 ? 1 : -1
				prop.rotation.y += spinSpeed * dt * dir
			}
		})

		// Update visual drone model position and rotation
		if (groupRef.current) {
			groupRef.current.position.copy(position.current)
			// Rotate to match yaw + visual tilt
			// YXZ order: Yaw -> Pitch -> Roll
			groupRef.current.rotation.set(droneTilt.current.pitch, euler.current.y, droneTilt.current.roll, 'YXZ')
		}
	})

	// Drone dimensions
	const bodySize = [0.1, 0.04, 0.15]
	const armLength = 0.25
	const armWidth = 0.025
	const armThickness = 0.015
	const propRadius = 0.12
	const propThickness = 0.002
	const motorHeight = 0.03
	const motorRadius = 0.02

	return (
		<group ref={groupRef}>
			{/* Main Body */}
			<mesh position={[0, 0, 0]}>
				<boxGeometry args={bodySize} />
				<meshStandardMaterial color='#2a2a2a' />
			</mesh>

			{/* Arms (X configuration) */}
			<group>
				{/* Arm 1 (Front-Right to Back-Left) */}
				<mesh rotation={[0, -Math.PI / 4, 0]}>
					<boxGeometry args={[armLength * 2.5, armThickness, armWidth]} />
					<meshStandardMaterial color='#2a2a2a' />
				</mesh>

				{/* Arm 2 (Front-Left to Back-Right) */}
				<mesh rotation={[0, Math.PI / 4, 0]}>
					<boxGeometry args={[armLength * 2.5, armThickness, armWidth]} />
					<meshStandardMaterial color='#2a2a2a' />
				</mesh>
			</group>

			{/* Motors and Props */}
			{[
				{ x: -1, z: -1 }, // Front Left
				{ x: 1, z: -1 }, // Front Right
				{ x: 1, z: 1 }, // Back Right
				{ x: -1, z: 1 }, // Back Left
			].map((pos, index) => {
				const reach = armLength * 0.9
				const x = pos.x * reach
				const z = pos.z * reach

				return (
					<group key={index} position={[x, armThickness / 2, z]}>
						{/* Motor */}
						<mesh position={[0, -motorHeight / 2, 0]}>
							<cylinderGeometry args={[motorRadius, motorRadius, motorHeight, 16]} />
							<meshStandardMaterial color='#2a2a2a' />
						</mesh>

						{/* Propeller */}
						<mesh ref={(el) => (propRefs.current[index] = el)} position={[0, motorHeight, 0]}>
							<boxGeometry args={[propRadius * 2.2, propThickness, propRadius * 0.2]} />
							<meshStandardMaterial color='#2a2a2a' />
						</mesh>
					</group>
				)
			})}

			{/* Drone Audio */}
			<DroneAudio velocityRef={velocity} />
		</group>
	)
}

export default Drone
