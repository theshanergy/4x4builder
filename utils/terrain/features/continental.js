// Continental terrain feature
// Determines large-scale land vs water distribution using layered noise
// This creates natural-looking continents, lakes, and coastal regions

import { CONTINENTAL_CONFIG } from '../../../config/terrain'
import { getLayeredNoise } from '../noise'

// Spawn protection radius - guaranteed land within this distance from origin
const SPAWN_LAND_RADIUS = 400
const SPAWN_LAND_TRANSITION = 300

/**
 * Get the continental value at a world position.
 * Returns a value from -1 to 1 where:
 *   < waterThreshold = water body (lake/sea)
 *   > waterThreshold = land
 * The value also influences terrain height (higher = more elevated inland areas)
 *
 * Note: The area near the spawn point (origin) is guaranteed to be land
 * to ensure players always spawn on solid ground.
 *
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} noise - Noise instance from noisejs
 * @returns {number} Continental value (-1 to 1)
 */
export const getContinentalValue = (worldX, worldZ, noise) => {
	const { scale, detailScale, detailStrength, waterThreshold } = CONTINENTAL_CONFIG

	// Primary continental noise - very large scale features
	// Use layered noise for more interesting shapes
	const primary = getLayeredNoise(worldX, worldZ, noise, scale, {
		octaves: 3,
		lacunarity: 2.2,
		persistence: 0.45,
	})

	// Secondary detail for more complex coastlines
	const detail = getLayeredNoise(worldX + 1000, worldZ + 1000, noise, detailScale, {
		octaves: 2,
		lacunarity: 2.5,
		persistence: 0.5,
	})

	// Combine primary and detail
	let continental = primary + detail * detailStrength

	// Spawn point protection - ensure land near origin
	// This creates a guaranteed land mass around the spawn point
	const distSq = worldX * worldX + worldZ * worldZ
	const dist = Math.sqrt(distSq)

	if (dist < SPAWN_LAND_RADIUS) {
		// Inside spawn protection - always land
		// Boost continental value to well above water threshold
		continental = Math.max(continental, waterThreshold + 0.3)
	} else if (dist < SPAWN_LAND_RADIUS + SPAWN_LAND_TRANSITION) {
		// Transition zone - blend between protected and natural
		const t = (dist - SPAWN_LAND_RADIUS) / SPAWN_LAND_TRANSITION
		const blend = t * t * (3 - 2 * t) // smoothstep
		const protectedValue = waterThreshold + 0.3
		continental = continental * blend + protectedValue * (1 - blend)
	}

	return continental
}

/**
 * Get the beach blend factor for terrain near water edges.
 * Returns 0 at water edge, 1 when fully inland beyond beach zone.
 * Used to suppress mountains near shores.
 *
 * @param {number} continentalValue - The continental noise value at this position
 * @returns {number} Beach blend factor (0 = at shore, 1 = inland)
 */
export const getBeachBlend = (continentalValue) => {
	const { waterThreshold, beachWidth, scale } = CONTINENTAL_CONFIG

	// Calculate approximate distance from water's edge in world units
	const continentalDifference = continentalValue - waterThreshold
	const approxDistance = continentalDifference / scale / 0.4

	if (approxDistance <= 0) {
		return 0 // In water or at edge
	}

	if (approxDistance >= beachWidth) {
		return 1 // Fully inland beyond beach
	}

	// Smooth transition using smoothstep
	const t = approxDistance / beachWidth
	return t * t * (3 - 2 * t)
}

/**
 * Check if a position is in a water body.
 *
 * @param {number} continentalValue - The continental noise value at this position
 * @returns {boolean} True if this position is water
 */
export const isWaterBody = (continentalValue) => {
	return continentalValue < CONTINENTAL_CONFIG.waterThreshold
}
