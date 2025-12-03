import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useXRInputSourceState } from '@react-three/xr'
import useInputStore from '../../store/inputStore'

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
 * - XR controller input (when in XR session)
 *
 * All input sources are combined - XR users can use both XR controllers and standard gamepads.
 * Must be used inside <XR> component for XR input to work.
 */
const InputManager = () => {
	const setKey = useInputStore((state) => state.setKey)
	const setInput = useInputStore((state) => state.setInput)

	// Get XR controller states using v6 API
	const xrLeftController = useXRInputSourceState('controller', 'left')
	const xrRightController = useXRInputSourceState('controller', 'right')

	// Setup keyboard event listeners
	useEffect(() => {
		const handleKeyDown = (e) => setKey(e.key, true)
		const handleKeyUp = (e) => setKey(e.key, false)

		window.addEventListener('keydown', handleKeyDown)
		window.addEventListener('keyup', handleKeyUp)

		return () => {
			window.removeEventListener('keydown', handleKeyDown)
			window.removeEventListener('keyup', handleKeyUp)
		}
	}, [setKey])

	// Poll all input sources every frame and combine them
	useFrame(() => {
		// Start with current input (preserves touch joystick values)
		const currentInput = useInputStore.getState().input
		let input = {
			leftStickX: currentInput.leftStickX,
			leftStickY: currentInput.leftStickY,
			rightStickX: currentInput.rightStickX,
			rightStickY: currentInput.rightStickY,
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

		// Poll XR controllers and combine with standard gamepad
		if (xrLeftController || xrRightController) {
			const xrLeftThumbstick = xrLeftController?.gamepad['xr-standard-thumbstick']
			const xrRightThumbstick = xrRightController?.gamepad['xr-standard-thumbstick']
			const xrLeftTrigger = xrLeftController?.gamepad['xr-standard-trigger']
			const xrRightTrigger = xrRightController?.gamepad['xr-standard-trigger']
			const xrLeftSqueeze = xrLeftController?.gamepad['xr-standard-squeeze']
			const xrRightSqueeze = xrRightController?.gamepad['xr-standard-squeeze']

			// XR controller buttons (A/B on right, X/Y on left for Quest controllers)
			const xrRightButtonA = xrRightController?.gamepad['a-button']
			const xrRightButtonB = xrRightController?.gamepad['b-button']
			const xrLeftButtonX = xrLeftController?.gamepad['x-button']
			const xrLeftButtonY = xrLeftController?.gamepad['y-button']

			// Helper to use whichever input has larger magnitude
			const maxMagnitude = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a)

			// Combine axes - use whichever has larger magnitude
			input.leftStickX = maxMagnitude(input.leftStickX, xrLeftThumbstick?.xAxis ?? 0)
			input.leftStickY = maxMagnitude(input.leftStickY, xrLeftThumbstick?.yAxis ?? 0)
			input.rightStickX = maxMagnitude(input.rightStickX, xrRightThumbstick?.xAxis ?? 0)
			input.rightStickY = maxMagnitude(input.rightStickY, xrRightThumbstick?.yAxis ?? 0)

			// Combine triggers - use max value
			input.leftTrigger = Math.max(input.leftTrigger, xrLeftTrigger?.state === 'pressed' ? 1 : 0)
			input.rightTrigger = Math.max(input.rightTrigger, xrRightTrigger?.state === 'pressed' ? 1 : 0)

			// Combine bumpers/squeeze
			input.leftBumper = input.leftBumper || xrLeftSqueeze?.state === 'pressed'
			input.rightBumper = input.rightBumper || xrRightSqueeze?.state === 'pressed'

			// Combine buttons (A/B on right controller, X/Y on left controller for Quest)
			input.buttonA = input.buttonA || xrRightButtonA?.state === 'pressed'
			input.buttonB = input.buttonB || xrRightButtonB?.state === 'pressed'
			input.buttonX = input.buttonX || xrLeftButtonX?.state === 'pressed'
			input.buttonY = input.buttonY || xrLeftButtonY?.state === 'pressed'
		}

		setInput(input)
	})

	return null
}

export default InputManager
