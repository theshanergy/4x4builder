import { useRef, useCallback } from 'react'
import useInputStore from '../store/inputStore'
import useMultiplayerStore from '../store/multiplayerStore'

/**
 * Hook to process raw input into vehicle control values
 * Handles keyboard, gamepad, and touch input combining
 * Respects chat open state to block keyboard input
 *
 * @returns {Function} getVehicleInput - Call each frame to get current vehicle input state
 */
export const useVehicleInput = () => {
	// Track reset button state to detect press (not hold)
	const resetPressedLastFrame = useRef(false)

	// Smoothed keyboard steering for lerping
	const smoothedKeyboardSteering = useRef(0)

	/**
	 * Get current vehicle input state
	 * @param {number} delta - Frame delta time
	 * @param {number} forwardSpeed - Current vehicle forward speed (for speed-based steering)
	 * @returns {Object} Vehicle input state
	 */
	const getVehicleInput = useCallback((delta, forwardSpeed = 0) => {
		const { keys, input } = useInputStore.getState()
		const chatOpen = useMultiplayerStore.getState().chatOpen

		// Helper to clamp values
		const clamp = (value) => Math.min(1, Math.max(-1, value))

		// When chat is open, ignore keyboard input (but allow gamepad/touch)
		const effectiveKeys = chatOpen ? new Set() : keys

		// Throttle input (forward)
		const throttleInput = clamp((effectiveKeys.has('ArrowUp') || effectiveKeys.has('w') ? 1 : 0) + (input.rightStickY < 0 ? -input.rightStickY : 0))

		// Brake input (backward/brake)
		const brakeInput = clamp((effectiveKeys.has('ArrowDown') || effectiveKeys.has('s') ? 1 : 0) + (input.rightStickY > 0 ? input.rightStickY : 0))

		// Drift mode (Shift key)
		const isDrifting = effectiveKeys.has('Shift')

		// Reset vehicle (R key or Y button) - detect press, not hold
		const resetPressed = effectiveKeys.has('r') || input.buttonY
		const shouldReset = resetPressed && !resetPressedLastFrame.current
		resetPressedLastFrame.current = resetPressed

		// Calculate keyboard steering target (-1, 0, or 1)
		const keyboardSteerTarget = (effectiveKeys.has('ArrowRight') || effectiveKeys.has('d') ? -1 : 0) + (effectiveKeys.has('ArrowLeft') || effectiveKeys.has('a') ? 1 : 0)

		// Speed-based steering lerp: slower response at higher speeds for better handling
		// At 0 speed: fast response (8 for centering, 5 for turning)
		// At high speed (~25 units/s): slower response (2 for centering, 1.2 for turning)
		const speedFactor = Math.min(1, Math.abs(forwardSpeed) / 25) // Normalize speed (0 to 1)
		const baseLerpSpeed = keyboardSteerTarget === 0 ? 8 : 5
		const minLerpSpeed = keyboardSteerTarget === 0 ? 2 : 1.2
		const steerLerpSpeed = baseLerpSpeed - (baseLerpSpeed - minLerpSpeed) * speedFactor

		smoothedKeyboardSteering.current += (keyboardSteerTarget - smoothedKeyboardSteering.current) * Math.min(1, steerLerpSpeed * delta)

		// Combine smoothed keyboard steering with analog stick input
		const steerInput = clamp(smoothedKeyboardSteering.current + -input.leftStickX)

		// Airborne control inputs
		const pitchInput = clamp(
			(effectiveKeys.has('ArrowUp') || effectiveKeys.has('w') ? -1 : 0) + (effectiveKeys.has('ArrowDown') || effectiveKeys.has('s') ? 1 : 0) - input.leftStickY
		)
		const rollInput = clamp(
			(effectiveKeys.has('ArrowLeft') || effectiveKeys.has('a') ? -1 : 0) + (effectiveKeys.has('ArrowRight') || effectiveKeys.has('d') ? 1 : 0) + input.leftStickX
		)
		const yawInput = clamp(-input.rightStickX)

		return {
			throttleInput,
			brakeInput,
			steerInput,
			isDrifting,
			shouldReset,
			// Airborne controls
			pitchInput,
			rollInput,
			yawInput,
		}
	}, [])

	return getVehicleInput
}

export default useVehicleInput
