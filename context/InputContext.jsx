import { createContext, useContext, useEffect, useRef } from 'react'

// Create the context
const InputContext = createContext(null)

// Custom hook to use the input context
export const useInput = () => {
    const context = useContext(InputContext)
    if (!context) {
        throw new Error('useInput must be used within an InputProvider')
    }
    return context
}

// Provider component
export const InputProvider = ({ children }) => {
    // Input state refs
    const leftStick = useRef({ x: 0, y: 0 })
    const rightStick = useRef({ x: 0, y: 0 })
    const leftTrigger = useRef(0)
    const rightTrigger = useRef(0)
    const buttons = useRef({})
    const keys = useRef({})

    useEffect(() => {
        let frameId = null

        // Update input based on current input device
        const updateInput = () => {
            const gamepad = navigator.getGamepads?.()?.[0]

            if (gamepad) {
                // Gamepad input
                Object.assign(leftStick.current, { x: gamepad.axes[0], y: gamepad.axes[1] })
                Object.assign(rightStick.current, { x: gamepad.axes[2], y: gamepad.axes[3] })
                leftTrigger.current = gamepad.buttons[6].pressed || 0
                rightTrigger.current = gamepad.buttons[7].pressed || 0

                gamepad.buttons.forEach((button, index) => {
                    buttons.current[`Button${index}`] = button.pressed
                })
            }

            // Continue the animation loop
            frameId = requestAnimationFrame(updateInput)
        }

        // Key event handlers
        const handleKey = (pressed) => (event) => {
            keys.current[event.code] = pressed
        }

        // Event handler references for cleanup
        const handleKeyDown = handleKey(true)
        const handleKeyUp = handleKey(false)
        const handleGamepadConnected = () => console.log('Gamepad connected')
        const handleGamepadDisconnected = () => console.log('Gamepad disconnected')

        // Start the animation loop
        updateInput()

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

    // The value that will be provided to consumers of this context
    const inputValue = { leftStick, rightStick, leftTrigger, rightTrigger, buttons, keys }

    return <InputContext.Provider value={inputValue}>{children}</InputContext.Provider>
}
