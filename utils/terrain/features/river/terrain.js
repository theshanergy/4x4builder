// River terrain feature
// Handles river carving into terrain for meandering waterway
// Uses RiverSpline as single source of truth

import { RIVER_CONFIG } from '../../../../config/water'
import { getRiverSpline } from './spline'

/**
 * Calculate how deeply the river should carve into terrain at a given position.
 * Returns 0-1 where 0 = no carving, 1 = full depth at river center.
 * 
 * The transition zone creates a symmetric S-curve:
 * - Water intersects terrain at exactly river width
 * - Transition extends inward from river width
 * - Creates gentle beach slope underwater
 * 
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @returns {number} Blend factor (0 = no carving, 1 = full depth)
 */
export const getRiverBlendFactor = (worldX, worldZ) => {
	const { transition } = RIVER_CONFIG

	// Get river data from spline
	const riverSpline = getRiverSpline()
	const { distance, riverData } = riverSpline.getDistanceToRiver(worldX, worldZ)
	const halfWidth = riverData.width / 2

	// Transition zone: from (halfWidth - transition) to halfWidth
	// Water intersects at exactly halfWidth, beyond that is no carving
	if (distance >= halfWidth) {
		return 0
	}

	const transitionStart = halfWidth - transition

	if (distance <= transitionStart) {
		// Deep water: full depth
		return 1
	}

	// In transition zone: symmetric S-curve from full depth to water level
	const t = (distance - transitionStart) / transition
	const smoothT = t * t * (3 - 2 * t) // smoothstep
	return 1 - smoothT
}
