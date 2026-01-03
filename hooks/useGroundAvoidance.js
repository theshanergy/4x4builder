import { useCallback } from 'react'

import useGameStore from '../store/gameStore'


// Custom hook for ground avoidance using direct terrain height sampling
export const useGroundAvoidance = (positionRef, minGroundDistance, targetRef = null) => {
	const getTerrainHeight = useGameStore((state) => state.getTerrainHeight)

	const checkGroundAvoidance = useCallback(() => {
		// Use direct terrain height sampling if available (much faster than raycasting)
		if (getTerrainHeight) {
			const groundHeight = getTerrainHeight(positionRef.current.x, positionRef.current.z)
			const requiredHeight = groundHeight + minGroundDistance

			// If camera is below required height, move it up
			if (positionRef.current.y < requiredHeight) {
				positionRef.current.y = requiredHeight
			}

			// Sample an additional point between camera and target to prevent clipping over hills
			if (targetRef) {
				const midX = (positionRef.current.x + targetRef.current.x) / 2
				const midZ = (positionRef.current.z + targetRef.current.z) / 2
				const midGroundHeight = getTerrainHeight(midX, midZ)
				const midRequiredHeight = midGroundHeight + minGroundDistance

				// If the interpolated midpoint would be below ground, raise the camera
				const midY = (positionRef.current.y + targetRef.current.y) / 2
				if (midY < midRequiredHeight) {
					// Raise camera to ensure the midpoint clears the terrain
					const heightDeficit = midRequiredHeight - midY
					positionRef.current.y += heightDeficit
				}
			}
		} else {
			// Fallback: ensure camera stays above minimum absolute height if terrain not ready
			const minAbsoluteHeight = 1.0
			if (positionRef.current.y < minAbsoluteHeight) {
				positionRef.current.y = minAbsoluteHeight
			}
		}
	}, [getTerrainHeight, minGroundDistance, targetRef])

	return checkGroundAvoidance
}
