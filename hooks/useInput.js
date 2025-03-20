import { useRef, useEffect } from 'react'
import useGameStore from '../store/gameStore'

/**
 * Hook to handle input from keyboard and gamepad
 * Uses refs to prevent rerenders when used within useFrame
 */
const useInput = () => {
    // Get store function to set input refs
    const setInputRefs = useGameStore((state) => state.setInputRefs)
    
    // Input state refs to prevent rerenders
    const leftStick = useRef({ x: 0, y: 0 })
    const rightStick = useRef({ x: 0, y: 0 })
    const leftTrigger = useRef(0)
    const rightTrigger = useRef(0)
    const buttons = useRef({})
    const keys = useRef({})
    
    // Create a refs object to store in the store
    const inputRefs = {
        leftStick,
        rightStick,
        leftTrigger,
        rightTrigger,
        buttons,
        keys
    }
    
    // Store the refs in the store
    useEffect(() => {
        setInputRefs(inputRefs)
    }, [setInputRefs])

    // Setup input handling
    useEffect(() => {
        // Key event handlers
        const handleKey = (pressed) => (event) => {
            keys.current[event.code] = pressed
        }

        // Event handler references for cleanup
        const handleKeyDown = handleKey(true)
        const handleKeyUp = handleKey(false)
        const handleGamepadConnected = () => console.log('Gamepad connected')
        const handleGamepadDisconnected = () => console.log('Gamepad disconnected')

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
        }
    }, [])

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
        
        // Start the animation loop
        updateInput()
        
        // Cleanup
        return () => {
            cancelAnimationFrame(frameId)
        }
    }, [])
    
    // No need to return anything as the refs are stored in the store
    return null
}

export default useInput