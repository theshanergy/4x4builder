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

const useInputStore = create((set) => ({
	keys: new Set(),
	input: { ...defaultInput },
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
	resetInput: () =>
		set(() => ({
			input: { ...defaultInput },
		})),
}))

export default useInputStore
