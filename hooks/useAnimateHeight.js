import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils } from 'three'

// Elastic out easing.
const elasticOutEasing = (t, p = 0.3) => {
    return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1
}

// Custom hook to animate height.
const useAnimateHeight = (elementRef, targetHeight, startHeight) => {
    const animation = useRef({ targetHeight, progress: 0, initialHeight: startHeight || 0 })

    useFrame((state, delta) => {
        // Target height has changed.
        if (animation.current.targetHeight !== targetHeight) {
            animation.current.targetHeight = targetHeight
            animation.current.progress = 0
            animation.current.initialHeight = elementRef.current.position.y
        }

        // Increment progress.
        animation.current.progress += delta
        animation.current.progress = MathUtils.clamp(animation.current.progress, 0, 1)

        // Get eased progress.
        const easedProgress = elasticOutEasing(animation.current.progress)

        // Get current height.
        const currentHeight = MathUtils.lerp(animation.current.initialHeight, animation.current.targetHeight, easedProgress)

        // Update element position.
        elementRef.current.position.y = currentHeight
    })
}

export default useAnimateHeight
