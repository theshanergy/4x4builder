import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import useInputStore from '../../../store/inputStore'
import useMultiplayerStore from '../../../store/multiplayerStore'

// Standard gamepad button/axis indices (Xbox layout)
const GAMEPAD = {
	AXIS_LEFT_X: 0,
	AXIS_LEFT_Y: 1,
	AXIS_RIGHT_X: 2,
	AXIS_RIGHT_Y: 3,
	BUTTON_A: 0,
	BUTTON_B: 1,
	BUTTON_X: 2,
	BUTTON_Y: 3,
	BUTTON_LB: 4,
	BUTTON_RB: 5,
	BUTTON_LT: 6,
	BUTTON_RT: 7,
}

/**
 * Component to handle all input sources:
 * - Keyboard input
 * - Standard gamepad input
 * - Touch joystick input (via touchInput in store)
 *
 * XR controller input is handled separately in XRManager when in XR session.
 */
const InputManager = () => {
	const setKey = useInputStore((state) => state.setKey)
	const setInput = useInputStore((state) => state.setInput)

	// Setup keyboard event listeners
	useEffect(() => {
		// Normalize key to handle Shift+key case changes
		// e.g., pressing 'w' then Shift will fire keyup as 'W'
		const normalizeKey = (key) => {
			// Only normalize single character keys (letters)
			if (key.length === 1) {
				return key.toLowerCase()
			}
			return key
		}

		const handleKeyDown = (e) => {
			// Ignore keyboard input when chat is open
			if (useMultiplayerStore.getState().chatOpen) return
			setKey(normalizeKey(e.key), true)
		}
		const handleKeyUp = (e) => {
			// Always process key up to prevent stuck keys
			setKey(normalizeKey(e.key), false)
		}

		window.addEventListener('keydown', handleKeyDown)
		window.addEventListener('keyup', handleKeyUp)

		return () => {
			window.removeEventListener('keydown', handleKeyDown)
			window.removeEventListener('keyup', handleKeyUp)
		}
	}, [setKey])

	// Poll all input sources every frame and combine them
	useFrame(() => {
		// Start with touch joystick values (set directly by UI or XR manager, not polled)
		const touchInput = useInputStore.getState().touchInput
		let input = {
			leftStickX: touchInput.leftStickX,
			leftStickY: touchInput.leftStickY,
			rightStickX: touchInput.rightStickX,
			rightStickY: touchInput.rightStickY,
			leftTrigger: 0,
			rightTrigger: 0,
			buttonA: false,
			buttonB: false,
			buttonX: false,
			buttonY: false,
			leftBumper: false,
			rightBumper: false,
		}

		// Poll standard gamepad
		const gamepad = navigator.getGamepads()[0]
		if (gamepad) {
			input.leftStickX = gamepad.axes[GAMEPAD.AXIS_LEFT_X] ?? 0
			input.leftStickY = gamepad.axes[GAMEPAD.AXIS_LEFT_Y] ?? 0
			input.rightStickX = gamepad.axes[GAMEPAD.AXIS_RIGHT_X] ?? 0
			input.rightStickY = gamepad.axes[GAMEPAD.AXIS_RIGHT_Y] ?? 0
			input.leftTrigger = gamepad.buttons[GAMEPAD.BUTTON_LT]?.value ?? 0
			input.rightTrigger = gamepad.buttons[GAMEPAD.BUTTON_RT]?.value ?? 0
			input.buttonA = gamepad.buttons[GAMEPAD.BUTTON_A]?.pressed ?? false
			input.buttonB = gamepad.buttons[GAMEPAD.BUTTON_B]?.pressed ?? false
			input.buttonX = gamepad.buttons[GAMEPAD.BUTTON_X]?.pressed ?? false
			input.buttonY = gamepad.buttons[GAMEPAD.BUTTON_Y]?.pressed ?? false
			input.leftBumper = gamepad.buttons[GAMEPAD.BUTTON_LB]?.pressed ?? false
			input.rightBumper = gamepad.buttons[GAMEPAD.BUTTON_RB]?.pressed ?? false
		}

		setInput(input)
	})

	return null
}

export default InputManager
