import { useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'

const useAnimateHeight = (targetValue, initialValue, duration = 1000) => {
    // Initialize animation state.
    const [animationState, setAnimationState] = useState({
        progress: 0,
        targetValue: targetValue,
        initialValue: initialValue,
        currentValue: initialValue,
    })

    // Update animation state when target value changes.
    useEffect(() => {
        setAnimationState((prevState) => ({
            ...prevState,
            progress: 0,
            initialValue: prevState.currentValue,
            targetValue,
        }))
    }, [targetValue])

    // Elastic out easing.
    const elasticOutEasing = (t, p = 0.3) => {
        return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1
    }

    // Update animation on each frame.
    useFrame((_, delta) => {
        // Animation in progress.
        if (animationState.progress < 1) {
            // Calculate new progress based on delta time and duration
            const newProgress = Math.min(animationState.progress + delta * (1000 / duration), 1)

            // Calculate the eased progress using custom easing function.
            const easedProgress = elasticOutEasing(newProgress)

            // Calculate new value based on eased progress.
            const newValue = animationState.initialValue + (animationState.targetValue - animationState.initialValue) * easedProgress

            // Update animation state with new progress and value.
            setAnimationState((prevState) => ({
                ...prevState,
                progress: newProgress,
                currentValue: newValue,
            }))
        }
    })

    return animationState.currentValue || animationState.initialValue
}

export default useAnimateHeight
