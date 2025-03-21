import { useEffect } from 'react'
import useInputStore from '../store/inputStore'

/**
 * Hook to handle input from keyboard and gamepad
 * Uses refs to prevent rerenders when used within useFrame
 */
const useInput = () => {
    // Store references
    const setKey = useInputStore((state) => state.setKey)
    const setGamepadState = useInputStore((state) => state.setGamepadState)

    // Setup input handling
    useEffect(() => {
        let frameId = null

        // Gamepad polling
        const pollGamepad = () => {
            const gamepads = navigator.getGamepads()
            const gamepad = gamepads[0]
            if (gamepad) {
                const axes = Array.from(gamepad.axes)
                const buttons = gamepad.buttons.map((button) => button.pressed)
                setGamepadState(axes, buttons)
            }

            // Continue the animation loop
            frameId = requestAnimationFrame(pollGamepad)
        }

        // Start the animation loop
        pollGamepad()

        // Log gamepad connection/disconnection
        const handleGamepadConnected = () => console.log('Gamepad connected')
        const handleGamepadDisconnected = () => console.log('Gamepad disconnected')

        // Keyboard event handlers
        const handleKeyDown = (e) => setKey(e.key, true)
        const handleKeyUp = (e) => setKey(e.key, false)

        // Set up event listeners
        window.addEventListener('gamepadconnected', handleGamepadConnected)
        window.addEventListener('gamepaddisconnected', handleGamepadDisconnected)
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        // Cleanup
        return () => {
            window.removeEventListener('gamepadconnected', handleGamepadConnected)
            window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            cancelAnimationFrame(frameId)
        }
    }, [])
}

export default useInput
