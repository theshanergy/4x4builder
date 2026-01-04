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
 * Get the distance to the nearest water edge (continental threshold).
 * Positive = on land, negative = in water.
 * The magnitude indicates how far from the shore.
 *
 * @param {number} continentalValue - The continental noise value at this position
 * @returns {number} Signed distance to shore (positive = land, negative = water)
 */
export const getShoreDistance = (continentalValue) => {
	const { waterThreshold, beachTransition } = CONTINENTAL_CONFIG

	// Distance from threshold, scaled by beach transition width
	// This gives an approximate "distance to shore" in world units
	const normalizedDistance = continentalValue - waterThreshold

	// Scale to approximate world units (rough estimation)
	// Continental noise changes by ~2 over its full scale, so:
	// distance in noise space * (1/scale) * 0.5 ≈ world distance
	return normalizedDistance * beachTransition * 3
}

/**
 * Get the beach blend factor for terrain near water edges.
 * Returns 0 at water edge, 1 when fully inland.
 * Used to flatten terrain near shores and create sandy beaches.
 *
 * @param {number} continentalValue - The continental noise value at this position
 * @returns {number} Beach blend factor (0 = at shore, 1 = inland)
 */
export const getBeachBlend = (continentalValue) => {
	const { waterThreshold, beachTransition } = CONTINENTAL_CONFIG

	// How far above the water threshold (in noise units)
	const aboveWater = continentalValue - waterThreshold

	// Beach zone extends from threshold to threshold + beachZone
	// beachTransition is in world units, convert to approximate noise units
	const beachZoneNoise = beachTransition * CONTINENTAL_CONFIG.scale * 2

	if (aboveWater <= 0) {
		return 0 // In water or at edge
	}

	if (aboveWater >= beachZoneNoise) {
		return 1 // Fully inland
	}

	// Smooth transition using smoothstep
	const t = aboveWater / beachZoneNoise
	return t * t * (3 - 2 * t)
}

/**
 * Get the water depth factor for positions below the continental threshold.
 * Returns 0 at shore, increasing toward 1 for deeper water.
 *
 * @param {number} continentalValue - The continental noise value at this position
 * @returns {number} Water depth factor (0 = shore, 1 = deep water)
 */
export const getWaterDepthFactor = (continentalValue) => {
	const { waterThreshold } = CONTINENTAL_CONFIG

	// How far below the water threshold
	const belowWater = waterThreshold - continentalValue

	if (belowWater <= 0) {
		return 0 // On land
	}

	// Depth increases with distance from shore
	// Cap at 1.0 for very deep water (continental value around -0.5 or lower)
	const depthRange = 0.4 // Continental range over which depth goes from 0 to 1
	return Math.min(1, belowWater / depthRange)
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
