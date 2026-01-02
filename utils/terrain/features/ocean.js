// Ocean terrain feature
// Handles ocean depth blending and beach transitions

import { OCEAN_CONFIG } from '../../../config/terrain'
import { WATER_LEVEL } from '../../../config/water'

/**
 * Apply ocean depth blending to terrain height.
 * Creates realistic beach profile with shallow beach section and steeper drop-off.
 * 
 * @param {number} combinedHeight - Current terrain height (normalized)
 * @param {number} distSq - Squared distance from origin
 * @param {number} baseHeightScale - Terrain height scale factor
 * @returns {number} Height after ocean blending (normalized)
 */
export const applyOceanBlending = (combinedHeight, distSq, baseHeightScale) => {
	const oceanTransitionStart = OCEAN_CONFIG.radius - OCEAN_CONFIG.transition
	const oceanTransitionStartSq = oceanTransitionStart * oceanTransitionStart

	// No ocean blending needed if we're inside the transition zone
	if (distSq <= oceanTransitionStartSq) {
		return combinedHeight
	}

	const dist = Math.sqrt(distSq)

	// Beyond ocean radius - full ocean depth (relative to water level)
	if (dist >= OCEAN_CONFIG.radius) {
		const normalizedWaterLevel = WATER_LEVEL / baseHeightScale
		const normalizedOceanDepth = OCEAN_CONFIG.depth / baseHeightScale
		return normalizedWaterLevel - normalizedOceanDepth
	}

	// In transition zone - smooth bezier-like curve through control point
	const t = (dist - oceanTransitionStart) / OCEAN_CONFIG.transition // 0 at shore, 1 at deep ocean

	const normalizedWaterLevel = WATER_LEVEL / baseHeightScale
	const normalizedOceanDepth = OCEAN_CONFIG.depth / baseHeightScale
	const oceanFloorHeight = normalizedWaterLevel - normalizedOceanDepth
	const midpointHeight = oceanFloorHeight * OCEAN_CONFIG.beachMidpointDepth

	// Quadratic bezier interpolation: start at combinedHeight, through midpoint, to oceanFloorHeight
	const bezierT = t * t * (3 - 2 * t) // Smoothstep for natural curve
	let finalHeight

	if (t < 0.5) {
		// Shallow beach section
		const localT = t * 2 // Map to 0-1
		finalHeight = combinedHeight * (1 - localT) + midpointHeight * localT
	} else {
		// Drop-off section
		const localT = (t - 0.5) * 2 // Map to 0-1
		const dropCurve = localT * localT // Quadratic for steeper descent
		finalHeight = midpointHeight * (1 - dropCurve) + oceanFloorHeight * dropCurve
	}

	// Suppress terrain noise as we enter water
	const noiseSuppression = (1 - bezierT) * (1 - bezierT) * (1 - bezierT)
	return combinedHeight * noiseSuppression + finalHeight * (1 - noiseSuppression)
}
