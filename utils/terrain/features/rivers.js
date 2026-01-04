// Procedural river channels feature
// Creates infinite river networks using noise-based channel detection
// Rivers carve through terrain and connect to water bodies

import { RIVER_CONFIG_PROCEDURAL, CONTINENTAL_CONFIG } from '../../../config/terrain'
import { WATER_LEVEL } from '../../../config/water'
import { getRidgeNoise } from '../noise'

/**
 * Get raw river channel value at a position.
 * Uses inverted ridge noise which naturally creates valley/channel patterns.
 * The key is that ridge noise creates sharp peaks - inverting it creates sharp valleys.
 *
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} noise - Noise instance from noisejs
 * @returns {number} Raw channel value (higher = more likely to be river)
 */
const getRawChannelValue = (worldX, worldZ, noise) => {
	const { channelScale } = RIVER_CONFIG_PROCEDURAL

	// Primary river channels - inverted ridge noise
	// Ridge noise gives us sharp peaks; 1 - ridge gives sharp valleys (rivers)
	const ridge1 = getRidgeNoise(worldX, worldZ, noise, channelScale)
	const channel1 = 1 - ridge1

	// Secondary channels at different scale for tributaries
	const ridge2 = getRidgeNoise(worldX + 2000, worldZ + 2000, noise, channelScale * 2)
	const channel2 = 1 - ridge2

	// Large-scale river system variation
	const ridge3 = getRidgeNoise(worldX - 1000, worldZ + 500, noise, channelScale * 0.4)
	const channel3 = 1 - ridge3

	// Combine: main rivers + large rivers + tributaries
	// Use max to get the strongest channel at each point
	return Math.max(channel1, channel3 * 0.9, channel2 * 0.6)
}

/**
 * Get the river blend factor at a position.
 * Returns 0-1 where 0 = no river, 1 = river center.
 *
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} noise - Noise instance from noisejs
 * @param {number} continentalValue - Continental noise value
 * @returns {number} River blend factor (0 = no river, 1 = river center)
 */
export const getRiverBlendFactor = (worldX, worldZ, noise, continentalValue) => {
	const { channelThreshold, minContinental } = RIVER_CONFIG_PROCEDURAL
	const { waterThreshold } = CONTINENTAL_CONFIG

	// Rivers only appear on land (above water threshold + small buffer)
	if (continentalValue < minContinental) {
		return 0
	}

	// Get raw channel value
	const channelValue = getRawChannelValue(worldX, worldZ, noise)

	// Rivers form where channel value exceeds threshold
	if (channelValue < channelThreshold) {
		return 0
	}

	// Calculate blend factor - how "river-like" this point is
	// Map from threshold to 1.0 into 0-1 range
	const riverStrength = (channelValue - channelThreshold) / (1 - channelThreshold)

	// Apply smooth curve for nicer transitions
	const smoothStrength = riverStrength * riverStrength * (3 - 2 * riverStrength)

	// Rivers get stronger (wider/deeper) closer to water bodies
	const distanceToWater = continentalValue - waterThreshold
	const waterProximityFactor = Math.max(0.5, 1 - distanceToWater * 1.5)

	return Math.min(1, smoothStrength * waterProximityFactor)
}

/**
 * Apply river carving to terrain height.
 * Creates a smooth river channel with sloped banks.
 *
 * @param {number} terrainHeight - Current terrain height (normalized)
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} noise - Noise instance from noisejs
 * @param {number} continentalValue - Continental noise value
 * @param {number} baseHeightScale - Terrain base height scale
 * @returns {number} Height after river carving (normalized)
 */
export const applyRiverCarving = (terrainHeight, worldX, worldZ, noise, continentalValue, baseHeightScale) => {
	const { depth } = RIVER_CONFIG_PROCEDURAL

	const blendFactor = getRiverBlendFactor(worldX, worldZ, noise, continentalValue)

	if (blendFactor <= 0) {
		return terrainHeight
	}

	// River parameters
	const normalizedRiverDepth = depth / baseHeightScale
	const normalizedWaterLevel = WATER_LEVEL / baseHeightScale

	// River bed target height (below water level)
	const riverBedHeight = normalizedWaterLevel - normalizedRiverDepth

	// Create smooth bank transition
	// blendFactor close to 0 = bank edge, close to 1 = river center
	// Use a curve that creates gradual slopes into the river

	// Bank profile: cubic ease for natural-looking slopes
	const bankCurve = blendFactor * blendFactor * (3 - 2 * blendFactor)

	// At river center: full depth
	// At river edge: terrain height (but starting to slope)
	// The key is to blend between terrain and river bed smoothly

	// Calculate the target height based on position in river
	const targetHeight = terrainHeight * (1 - bankCurve) + riverBedHeight * bankCurve

	// Also suppress terrain variation in the river for smoother bed
	const variationSuppression = 1 - blendFactor * 0.8
	const smoothedHeight = targetHeight * variationSuppression + riverBedHeight * (1 - variationSuppression)

	// Ensure we don't go too deep
	const minHeight = normalizedWaterLevel - normalizedRiverDepth * 1.3
	return Math.max(smoothedHeight, minHeight)
}

/**
 * Check if a position is in a river (underwater portion).
 *
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} noise - Noise instance from noisejs
 * @param {number} continentalValue - Continental noise value
 * @returns {boolean} True if position is in a river
 */
export const isInRiver = (worldX, worldZ, noise, continentalValue) => {
	const blendFactor = getRiverBlendFactor(worldX, worldZ, noise, continentalValue)
	return blendFactor > 0.3
}
