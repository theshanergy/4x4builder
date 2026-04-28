import { useRef, useEffect } from 'react'
import { MathUtils } from 'three'
import useInputStore from '../store/inputStore'

/**
 * Hook to handle all drone input processing (keyboard, mouse, gamepad)
 * Returns processed input values for drone movement
 */
export const useDroneInput = (config, euler) => {
	const hasInitialized = useRef(false)

	// Initialize camera rotation from current orientation
	useEffect(() => {
		if (!hasInitialized.current && euler.current) {
			hasInitialized.current = true
		}
	}, [euler])

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

	/**
	 * Process all input sources and return movement commands
	 * @param {number} dt - Delta time
	 * @returns {Object} Input state with pitch, yaw, throttle, strafe, isBoosting
	 */
	const processInput = (dt) => {
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
		// W/S: Forward/backward on horizontal plane
		// A/D: Strafe left/right
		// Q/E or Arrow Up/Down: Altitude (throttle)
		// Arrow Left/Right: Rotate (yaw)
		let pitchInput = 0 // W/S - forward/back
		let yawInput = 0 // Arrow Left/Right - rotate
		let throttleInput = 0 // Q/E or Arrow Up/Down - altitude
		let strafeInput = 0 // A/D - strafe left/right

		if (keys.has('w')) pitchInput += 1 // Move forward
		if (keys.has('s')) pitchInput -= 1 // Move backward
		if (keys.has('ArrowLeft')) yawInput += 1 // Rotate left
		if (keys.has('ArrowRight')) yawInput -= 1 // Rotate right
		if (keys.has('ArrowUp') || keys.has('e') || keys.has('E')) throttleInput += 1 // Ascend
		if (keys.has('ArrowDown') || keys.has('q') || keys.has('Q')) throttleInput -= 1 // Descend
		if (keys.has('a')) strafeInput -= 1 // Strafe left
		if (keys.has('d')) strafeInput += 1 // Strafe right

		// Speed boost
		const isBoosting = keys.has('Shift')

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
			euler.current.x = MathUtils.lerp(euler.current.x, config.defaultPitch, config.rotationReturnSpeed * dt)
		}

		return {
			pitch: pitchInput,
			yaw: yawInput,
			throttle: throttleInput,
			strafe: strafeInput,
			isBoosting,
			isPointerLocked,
		}
	}

	return { processInput }
}
