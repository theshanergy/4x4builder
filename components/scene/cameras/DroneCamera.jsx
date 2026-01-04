import { useRef, useEffect } from 'react'
import { Vector3, MathUtils, Euler } from 'three'
import { useFrame, useThree } from '@react-three/fiber'

import { vehicleState } from '../../../store/gameStore'
import useInputStore from '../../../store/inputStore'
import { useGroundAvoidance } from '../../../hooks/useGroundAvoidance'

// Drone camera controller with simplified arcade-style movement
// Controls:
//   W/S: Tilt forward/back (pitch) - moves drone forward/back
//   A/D: Strafe left/right
//   Q/E or Shift/Space: Descend/Ascend altitude (throttle)
//   Arrow Up/Down: Increase/decrease altitude (throttle)
//   Arrow Left/Right: Rotate left/right (yaw)
//   Mouse: Look around (adjusts drone orientation)
//   Gamepad: Left stick = strafe/altitude, Right stick = look, Triggers = yaw
const DroneCamera = () => {
	const camera = useThree((state) => state.camera)

	// Camera/drone state
	const currentPosition = useRef(camera.position.clone())
	const euler = useRef(new Euler(0, 0, 0, 'YXZ'))
	const defaultPitch = useRef(-0.2) // Default vertical angle to return to (-0.2 radians ≈ -11 degrees)
	const combinedEuler = useRef(new Euler(0, 0, 0, 'YXZ'))
	const hasInitialized = useRef(false)
	const hasLaunched = useRef(false) // Track if we've done the initial launch

	// Movement state
	const velocity = useRef(new Vector3(0, 0, 0))
	const droneTilt = useRef({ pitch: 0, roll: 0 }) // Visual tilt separate from camera look

	// Movement config
	const config = {
		// Movement speeds
		moveSpeed: 20, // Horizontal movement speed
		verticalSpeed: 10, // Vertical movement speed
		acceleration: 6, // How fast we lerp to target speed

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
		minGroundDistance: 1.0,

		// Camera
		targetFov: 60,

		// Elevation-based tilt
		elevationTiltFactor: 0.015, // Radians of downward tilt per meter of elevation
		maxElevationTilt: 0.3, // Max downward tilt from elevation (~17 degrees)
		baseElevation: 0, // Ground level reference
	}

	const lastFov = useRef(camera.fov)

	// Ground avoidance
	const checkGroundAvoidance = useGroundAvoidance(currentPosition, config.minGroundDistance)

	// Initialize camera rotation from current orientation
	useEffect(() => {
		if (!hasInitialized.current) {
			euler.current.setFromQuaternion(camera.quaternion)
			hasInitialized.current = true
		}

		// Position camera above and behind the vehicle if starting fresh
		if (currentPosition.current.distanceTo(vehicleState.position) < 1) {
			currentPosition.current.set(vehicleState.position.x - 10, vehicleState.position.y + 8, vehicleState.position.z - 10)
			camera.position.copy(currentPosition.current)
		}

		// Launch drone upward by 5 meters when first switching to it
		if (!hasLaunched.current) {
			velocity.current.y = 10 // Set upward velocity for smooth launch
			hasLaunched.current = true
		}
	}, [camera])

	// Request pointer lock on mount, handle click-to-lock, and exit on unmount
	useEffect(() => {
		const { requestPointerLock, exitPointerLock } = useInputStore.getState()

		// Automatically request pointer lock when entering drone mode
		requestPointerLock?.()

		// Click to re-acquire pointer lock
		const handleClick = () => {
			const { mouseInput } = useInputStore.getState()
			if (!mouseInput.isPointerLocked) {
				requestPointerLock?.()
			}
		}

		document.addEventListener('click', handleClick)

		return () => {
			document.removeEventListener('click', handleClick)
			// Exit pointer lock when switching away from drone camera
			exitPointerLock?.()
		}
	}, [])

	useFrame((state, delta) => {
		// Clamp delta to prevent physics explosions on lag spikes
		const dt = Math.min(delta, 0.1)

		const { keys, input, touchInput, mouseInput, consumeMouseMovement } = useInputStore.getState()
		const isPointerLocked = mouseInput.isPointerLocked

		// Handle mouse look input
		const mouseMovement = consumeMouseMovement()
		if (isPointerLocked && (mouseMovement.x !== 0 || mouseMovement.y !== 0)) {
			euler.current.y -= mouseMovement.x * config.mouseSensitivity
			euler.current.x -= mouseMovement.y * config.mouseSensitivity
			euler.current.x = MathUtils.clamp(euler.current.x, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1)
		}

		// Keyboard inputs
		// WASD: pitch (forward/back tilt) and strafe (left/right)
		let pitchInput = 0 // W/S - tilt forward/back
		let yawInput = 0 // Arrow Left/Right - rotate
		let throttleInput = 0 // Arrow Up/Down - altitude
		let strafeInput = 0 // A/D - strafe left/right

		if (keys.has('w')) pitchInput += 1 // Tilt forward
		if (keys.has('s')) pitchInput -= 1 // Tilt backward
		if (keys.has('ArrowLeft')) yawInput += 1 // Rotate left
		if (keys.has('ArrowRight')) yawInput -= 1 // Rotate right
		if (keys.has('ArrowUp') || keys.has('e') || keys.has('E') || keys.has(' ')) throttleInput += 1 // Ascend
		if (keys.has('ArrowDown') || keys.has('q') || keys.has('Q') || keys.has('Shift')) throttleInput -= 1 // Descend
		if (keys.has('a')) strafeInput -= 1 // Strafe left
		if (keys.has('d')) strafeInput += 1 // Strafe right

		// Gamepad inputs
		// Left stick: strafe (X) and altitude (Y)
		// Right stick: camera look
		// Triggers/Bumpers: yaw rotation
		const gamepadLookX = input.rightStickX || touchInput.rightStickX || 0
		const gamepadLookY = input.rightStickY || touchInput.rightStickY || 0
		const gamepadStrafeX = input.leftStickX || touchInput.leftStickX || 0
		const gamepadThrottle = -(input.leftStickY || touchInput.leftStickY || 0) // Inverted: up = ascend
		const gamepadYaw = (input.leftTrigger || 0) - (input.rightTrigger || 0) // LT = rotate left, RT = rotate right

		// Combine gamepad with keyboard
		strafeInput += gamepadStrafeX
		throttleInput += gamepadThrottle
		yawInput += gamepadYaw

		// Pitch from right stick Y when held with bumper (advanced control)
		if (input.rightBumper) {
			pitchInput += -gamepadLookY
		}

		// Clamp combined inputs
		pitchInput = MathUtils.clamp(pitchInput, -1, 1)
		yawInput = MathUtils.clamp(yawInput, -1, 1)
		throttleInput = MathUtils.clamp(throttleInput, -1, 1)
		strafeInput = MathUtils.clamp(strafeInput, -1, 1)

		// Handle gamepad look input (right stick) - only when not using advanced pitch control
		if (!input.rightBumper && (Math.abs(gamepadLookX) > 0.1 || Math.abs(gamepadLookY) > 0.1)) {
			euler.current.y -= gamepadLookX * config.gamepadLookSensitivity * dt
			euler.current.x -= gamepadLookY * config.gamepadLookSensitivity * dt
			euler.current.x = MathUtils.clamp(euler.current.x, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1)
		}

		// When pointer is not locked, smoothly return camera to default vertical angle
		if (!isPointerLocked) {
			euler.current.x = MathUtils.lerp(euler.current.x, defaultPitch.current, config.rotationReturnSpeed * dt)
		}

		// Interpolate tilt - use faster recovery speed when input is near zero
		const pitchTarget = Math.abs(pitchInput) > 0.1 ? pitchInput * config.maxTiltAngle : 0
		const rollTarget = Math.abs(strafeInput) > 0.1 ? strafeInput * config.maxTiltAngle : 0
		const pitchLerpSpeed = Math.abs(pitchInput) > 0.1 ? config.tiltSpeed : config.tiltRecovery
		const rollLerpSpeed = Math.abs(strafeInput) > 0.1 ? config.tiltSpeed : config.tiltRecovery

		droneTilt.current.pitch = MathUtils.lerp(droneTilt.current.pitch, pitchTarget, pitchLerpSpeed * dt)
		droneTilt.current.roll = MathUtils.lerp(droneTilt.current.roll, rollTarget, rollLerpSpeed * dt)

		// Apply yaw rotation (simple lerp to target speed)
		euler.current.y += yawInput * config.yawSpeed * dt

		// Calculate target velocity based on inputs
		const yaw = euler.current.y
		const cosYaw = Math.cos(yaw)
		const sinYaw = Math.sin(yaw)

		// Target horizontal velocity from pitch/strafe inputs
		const targetVelX = (pitchInput * -sinYaw + strafeInput * cosYaw) * config.moveSpeed
		const targetVelZ = (pitchInput * -cosYaw + strafeInput * -sinYaw) * config.moveSpeed
		const targetVelY = throttleInput * config.verticalSpeed

		// Lerp velocity towards target
		velocity.current.x = MathUtils.lerp(velocity.current.x, targetVelX, config.acceleration * dt)
		velocity.current.z = MathUtils.lerp(velocity.current.z, targetVelZ, config.acceleration * dt)
		velocity.current.y = MathUtils.lerp(velocity.current.y, targetVelY, config.acceleration * dt)

		// Apply velocity to position
		currentPosition.current.x += velocity.current.x * dt
		currentPosition.current.y += velocity.current.y * dt
		currentPosition.current.z += velocity.current.z * dt

		// Ground avoidance - stop downward velocity if we hit ground
		const prevY = currentPosition.current.y
		checkGroundAvoidance()
		if (currentPosition.current.y > prevY && velocity.current.y < 0) {
			velocity.current.y = 0
		}

		// Apply position to camera
		camera.position.copy(currentPosition.current)

		// Calculate elevation-based downward tilt
		// At ground level (baseElevation), tilt is 0. As we go higher, tilt increases
		const elevation = Math.max(0, currentPosition.current.y - config.baseElevation)
		const elevationTilt = Math.min(elevation * config.elevationTiltFactor, config.maxElevationTilt)

		// Apply rotation to camera - combine look direction with drone tilt for visual effect
		// Create a combined euler that adds tilt to the look direction
		combinedEuler.current.copy(euler.current)
		combinedEuler.current.x -= droneTilt.current.pitch * 0.3 // Subtle pitch effect on camera
		combinedEuler.current.x -= elevationTilt // Add downward tilt based on elevation (subtract to tilt down)
		combinedEuler.current.z = -droneTilt.current.roll * 0.5 // Roll tilts the horizon
		camera.quaternion.setFromEuler(combinedEuler.current)

		// Smoothly transition FOV
		const newFov = MathUtils.damp(camera.fov, config.targetFov, 3, dt)
		if (Math.abs(newFov - lastFov.current) > 0.01) {
			camera.fov = newFov
			camera.updateProjectionMatrix()
			lastFov.current = newFov
		}
	})

	return null
}

export default DroneCamera
