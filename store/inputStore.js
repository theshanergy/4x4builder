// inputStore.js
import { create } from 'zustand'

// Semantic input state - all values normalized to 0-1 or -1 to 1 range
const defaultInput = {
	// Axes (-1 to 1)
	leftStickX: 0,
	leftStickY: 0,
	rightStickX: 0,
	rightStickY: 0,
	// Triggers (0 to 1)
	leftTrigger: 0,
	rightTrigger: 0,
	// Buttons (boolean)
	buttonA: false,
	buttonB: false,
	buttonX: false,
	buttonY: false,
	leftBumper: false,
	rightBumper: false,
}

// Touch joystick input (separate from polled input sources)
const defaultTouchInput = {
	leftStickX: 0,
	leftStickY: 0,
	rightStickX: 0,
	rightStickY: 0,
}

// Mouse input state
const defaultMouseInput = {
	movementX: 0,
	movementY: 0,
	isPointerLocked: false,
}

const useInputStore = create((set) => ({
	keys: new Set(),
	input: { ...defaultInput },
	touchInput: { ...defaultTouchInput },
	mouseInput: { ...defaultMouseInput },
	setKey: (key, pressed) =>
		set((state) => {
			const keys = new Set(state.keys)
			if (pressed) keys.add(key)
			else keys.delete(key)
			return { keys }
		}),
	setInput: (newInput) =>
		set((state) => ({
			input: { ...state.input, ...newInput },
		})),
	setTouchInput: (newTouchInput) =>
		set((state) => ({
			touchInput: { ...state.touchInput, ...newTouchInput },
		})),
	setMouseInput: (newMouseInput) =>
		set((state) => ({
			mouseInput: { ...state.mouseInput, ...newMouseInput },
		})),
	// Consume mouse movement (returns current values and resets to zero)
	consumeMouseMovement: () => {
		const { mouseInput } = useInputStore.getState()
		const movement = { x: mouseInput.movementX, y: mouseInput.movementY }
		if (movement.x !== 0 || movement.y !== 0) {
			set((state) => ({
				mouseInput: { ...state.mouseInput, movementX: 0, movementY: 0 },
			}))
		}
		return movement
	},
	resetInput: () =>
		set(() => ({
			input: { ...defaultInput },
			mouseInput: { ...defaultMouseInput },
		})),
}))

export default useInputStore
