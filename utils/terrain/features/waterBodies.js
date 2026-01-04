// Procedural water bodies feature
// Handles depth calculation for lakes and seas based on continental noise
// Replaces the hardcoded ocean system with infinite procedural water bodies

import { WATER_LEVEL } from '../../../config/water'
import { CONTINENTAL_CONFIG } from '../../../config/terrain'

/**
 * Blend terrain height with water body at the shoreline.
 * Creates smooth beach transitions using a simple distance-based slope.
 *
 * The approach:
 * - Calculate distance from water's edge using continental noise
 * - On land: smooth S-curve transition from inland terrain down to water level
 * - In water: smooth S-curve transition from water level down to max depth
 * - Beyond these zones: use original terrain or flat ocean floor
 *
 * @param {number} terrainHeight - The calculated land terrain height (normalized)
 * @param {number} continentalValue - Continental noise value at this position
 * @param {number} baseHeightScale - Terrain base height scale
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @returns {number} Blended height value
 */
export const blendWaterBodyTerrain = (terrainHeight, continentalValue, baseHeightScale, noise, worldX, worldZ) => {
	const { waterThreshold, beachWidth, beachSlope, beachSmoothness, underwaterSlope, maxDepth, scale } = CONTINENTAL_CONFIG

	const normalizedWaterLevel = WATER_LEVEL / baseHeightScale
	const normalizedMaxDepth = maxDepth / baseHeightScale

	// Calculate approximate distance from water's edge in world units
	// Continental noise changes gradually, so we can estimate distance
	// by scaling the difference from threshold by the inverse of the noise scale
	const continentalDifference = continentalValue - waterThreshold
	const approxDistance = continentalDifference / scale / 0.4 // 0.4 is empirical scaling factor

	// Smoothstep function for S-curve transitions
	const smoothstep = (t) => {
		const clamped = Math.max(0, Math.min(1, t))
		// True S-curve: smooth at both ends
		if (beachSmoothness === 2) {
			// Classic smoothstep (cubic hermite)
			return clamped * clamped * (3 - 2 * clamped)
		} else if (beachSmoothness === 3) {
			// Smoother step (quintic)
			return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10)
		} else {
			// Linear fallback
			return clamped
		}
	}

	// === CASE 1: Deep inland - no beach effect ===
	if (approxDistance > beachWidth) {
		return terrainHeight
	}

	// === CASE 2: On land (beach zone) - smooth S-curve from terrain to water level ===
	if (approxDistance > 0) {
		const beachProgress = approxDistance / beachWidth // 0 at water's edge, 1 at end of beach
		
		// Calculate beach height: starts at water level, rises with slope
		const beachHeight = normalizedWaterLevel + beachProgress * beachSlope * beachWidth / baseHeightScale

		// Only flatten terrain if it's higher than the beach slope would be
		const targetHeight = Math.min(terrainHeight, beachHeight)

		// Smooth S-curve transition from targetHeight (at water) to terrainHeight (inland)
		const blendFactor = smoothstep(beachProgress)
		return targetHeight * (1 - blendFactor) + terrainHeight * blendFactor
	}

	// === CASE 3: In water (underwater slope zone) - smooth S-curve to max depth ===
	const maxUnderwaterDistance = maxDepth / underwaterSlope // How far underwater until max depth
	const underwaterDistance = -approxDistance // Make positive for calculations

	if (underwaterDistance < maxUnderwaterDistance) {
		const underwaterProgress = underwaterDistance / maxUnderwaterDistance // 0 at water's edge, 1 at max depth
		
		// Smooth S-curve from water level to max depth
		const depthFactor = smoothstep(underwaterProgress)
		const depth = depthFactor * maxDepth
		const targetHeight = normalizedWaterLevel - depth / baseHeightScale

		// Add subtle floor variation for visual interest
		const floorNoise =
			noise.perlin2(worldX * 0.008, worldZ * 0.008) * 0.3 +
			noise.perlin2(worldX * 0.02, worldZ * 0.02) * 0.15

		return targetHeight + floorNoise * depthFactor * 0.5
	}

	// === CASE 4: Deep water - flat ocean floor at max depth ===
	const floorNoise =
		noise.perlin2(worldX * 0.008, worldZ * 0.008) * 0.3 +
		noise.perlin2(worldX * 0.02, worldZ * 0.02) * 0.15

	return normalizedWaterLevel - normalizedMaxDepth + floorNoise * 0.5
}
