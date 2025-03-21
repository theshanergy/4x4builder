// inputStore.js
import { create } from 'zustand'

const useInputStore = create((set) => ({
    keys: new Set(),
    gamepadAxes: [],
    gamepadButtons: [],
    setKey: (key, pressed) =>
        set((state) => {
            const keys = new Set(state.keys)
            if (pressed) keys.add(key)
            else keys.delete(key)
            return { keys }
        }),
    setGamepadState: (axes, buttons) =>
        set(() => ({
            gamepadAxes: axes,
            gamepadButtons: buttons,
        })),
}))

export default useInputStore
