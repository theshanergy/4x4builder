// Staging area terrain feature
// Handles the flat starting area and smooth transition to natural terrain

import { STAGING_AREA } from '../../../config/terrain'

/**
 * Calculate staging area blend factor at a given distance from origin.
 * Returns 0 for flat area, 1 for natural terrain, with smooth transition between.
 * 
 * @param {number} distSq - Squared distance from origin
 * @returns {number} Blend factor (0 = flat, 1 = natural terrain)
 */
export const getStagingBlend = (distSq) => {
	const flatAreaRadiusSq = STAGING_AREA.flatRadius * STAGING_AREA.flatRadius
	const transitionEndDistSq = STAGING_AREA.transitionEnd * STAGING_AREA.transitionEnd

	// Outside transition zone - full natural terrain
	if (distSq >= transitionEndDistSq) {
		return 1
	}

	// Inside flat radius - completely flat
	if (distSq < flatAreaRadiusSq) {
		return 0
	}

	// In transition zone - smooth blend using smoothstep
	const dist = Math.sqrt(distSq)
	const t = (dist - STAGING_AREA.flatRadius) / (STAGING_AREA.transitionEnd - STAGING_AREA.flatRadius)
	
	// Cubic smoothstep for extra smooth transition
	return t * t * t * (t * (t * 6 - 15) + 10)
}
