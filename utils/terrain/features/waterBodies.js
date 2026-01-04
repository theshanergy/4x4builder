// Procedural water bodies feature
// Handles depth calculation for lakes and seas based on continental noise
// Replaces the hardcoded ocean system with infinite procedural water bodies

import { WATER_LEVEL } from '../../../config/water'
import { CONTINENTAL_CONFIG } from '../../../config/terrain'

// Water body configuration
const WATER_BODY_CONFIG = {
	// Maximum depth below water level for deep water
	maxDepth: 12,
	// Width of the underwater slope zone (world units equivalent)
	shoreSlope: 0.15, // Continental noise range for gradual underwater slope
}

/**
 * Blend terrain height with water body at the shoreline.
 * Creates smooth beach transitions that slope gradually into the water.
 *
 * The key insight: we need a WIDE transition zone that spans both above
 * and below the water line, creating a continuous slope from land into water.
 *
 * @param {number} terrainHeight - The calculated land terrain height (normalized)
 * @param {number} continentalValue - Continental noise value at this position
 * @param {number} baseHeightScale - Terrain base height scale
 * @param {Object} noise - Noise instance
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @returns {number} Blended height value
 */
export const blendWaterBodyTerrain = (terrainHeight, continentalValue, baseHeightScale, noise, worldX, worldZ) => {
	const { waterThreshold } = CONTINENTAL_CONFIG
	const { maxDepth, shoreSlope } = WATER_BODY_CONFIG

	const normalizedWaterLevel = WATER_LEVEL / baseHeightScale
	const normalizedMaxDepth = maxDepth / baseHeightScale

	// Define the shore zone - spans from above to below water threshold
	// This creates a continuous slope through the waterline
	const shoreZoneAbove = 0.12 // How far above threshold the beach starts (flattening)
	const shoreZoneBelow = shoreSlope // How far below threshold before deep water

	const shoreStart = waterThreshold + shoreZoneAbove // Upper edge of beach
	const deepWaterStart = waterThreshold - shoreZoneBelow // Where deep water begins

	// Case 1: Fully inland - no beach effect
	if (continentalValue >= shoreStart) {
		return terrainHeight
	}

	// Case 2: Deep water - flat lake/sea floor
	if (continentalValue <= deepWaterStart) {
		// Add subtle floor variation
		const floorNoise =
			noise.perlin2(worldX * 0.008, worldZ * 0.008) * 0.3 +
			noise.perlin2(worldX * 0.02, worldZ * 0.02) * 0.15

		// Depth increases further from shore
		const deepFactor = Math.min(1, (deepWaterStart - continentalValue) / 0.3)
		const depth = normalizedMaxDepth * (0.5 + deepFactor * 0.5)

		return normalizedWaterLevel - depth + floorNoise * deepFactor
	}

	// Case 3: Shore zone - smooth transition from beach to underwater slope
	// Map continental value to 0-1 range within shore zone
	const t = (continentalValue - deepWaterStart) / (shoreStart - deepWaterStart)

	// Use a smooth S-curve for the height transition
	const smoothT = t * t * (3 - 2 * t)

	// Calculate beach surface height (above water, slopes down to water level)
	// At t=1 (shoreStart): terrain height with some flattening
	// At t=0.5 (waterThreshold): at water level
	// At t=0 (deepWaterStart): shallow underwater

	// Target heights at key points
	const inlandHeight = terrainHeight * 0.7 + normalizedWaterLevel * 0.3 + 0.15 // Flattened beach above water
	const waterLineHeight = normalizedWaterLevel + 0.02 // Just at water level
	const shallowDepth = normalizedWaterLevel - normalizedMaxDepth * 0.15 // Shallow underwater

	let targetHeight
	if (t > 0.5) {
		// Above water line - blend from inland to water level
		const aboveT = (t - 0.5) * 2 // 0 at waterline, 1 at shoreStart
		const smoothAbove = aboveT * aboveT * (3 - 2 * aboveT)
		targetHeight = waterLineHeight * (1 - smoothAbove) + inlandHeight * smoothAbove
	} else {
		// Below water line - blend from water level to shallow depth
		const belowT = t * 2 // 0 at deepWaterStart, 1 at waterline
		const smoothBelow = belowT * belowT * (3 - 2 * belowT)
		targetHeight = shallowDepth * (1 - smoothBelow) + waterLineHeight * smoothBelow
	}

	// Suppress terrain noise near the shore for smooth sandy appearance
	const noiseSuppression = smoothT * smoothT
	const blendedHeight = targetHeight * (1 - noiseSuppression * 0.3) + terrainHeight * noiseSuppression * 0.3

	return blendedHeight
}
