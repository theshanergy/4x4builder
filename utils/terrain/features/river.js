// River terrain feature
// Handles river carving into terrain for meandering waterway

import { RIVER_CONFIG } from '../../../config/terrain'

/**
 * Calculate the Z position of the river center at a given X coordinate.
 * The river meanders using multiple sine waves plus noise for organic variation.
 * 
 * @param {number} worldX - World X coordinate
 * @param {Object} noise - Noise instance from noisejs
 * @returns {number} River center Z position
 */
const getRiverCenterZ = (worldX, noise) => {
	const { baseZ, primaryFrequency, primaryAmplitude, secondaryFrequency, secondaryAmplitude, tertiaryAmplitude } = RIVER_CONFIG
	const primary = Math.sin(worldX * primaryFrequency) * primaryAmplitude
	const secondary = Math.sin(worldX * secondaryFrequency + 1.5) * secondaryAmplitude
	const tertiary = noise ? noise.perlin2(worldX * 0.003, 0.5) * tertiaryAmplitude : 0
	return baseZ + primary + secondary + tertiary
}

/**
 * Calculate river width at a given X coordinate.
 * Width varies slightly using noise for natural appearance.
 * 
 * @param {number} worldX - World X coordinate
 * @param {Object} noise - Noise instance from noisejs
 * @returns {number} River width in world units
 */
const getRiverWidth = (worldX, noise) => {
	const { width, widthVariation } = RIVER_CONFIG
	const variation = noise ? noise.perlin2(worldX * 0.005 + 100, 0.5) * widthVariation : 0
	return width + variation
}

/**
 * Calculate distance from a world position to the nearest point on the river.
 * Returns an object with distance and river geometry info at that X position.
 * 
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} noise - Noise instance from noisejs
 * @returns {Object} - { distance, riverZ, riverWidth, clampedX }
 */
const getDistanceToRiver = (worldX, worldZ, noise) => {
	const { startX, endX } = RIVER_CONFIG
	const clampedX = Math.max(startX, Math.min(endX, worldX))
	const riverZ = getRiverCenterZ(clampedX, noise)
	const riverWidth = getRiverWidth(clampedX, noise)
	const distance = Math.abs(worldZ - riverZ)
	return { distance, riverZ, riverWidth, clampedX }
}

/**
 * Calculate how deeply the river should carve into terrain at a given position.
 * Returns 0-1 where 0 = no carving, 1 = maximum depth at river center.
 * Uses smooth transitions for banks.
 * 
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} noise - Noise instance from noisejs
 * @returns {number} Blend factor (0 = no carving, 1 = full depth)
 */
export const getRiverBlendFactor = (worldX, worldZ, noise) => {
	const { bankSlope } = RIVER_CONFIG

	const { distance, riverWidth } = getDistanceToRiver(worldX, worldZ, noise)
	const halfWidth = riverWidth / 2

	if (distance < halfWidth) {
		// River bed: full depth in center, transitioning to 20% depth at edges
		return 1 - (distance / halfWidth) * 0.8
	} else if (distance < halfWidth + bankSlope) {
		// Banks: slope from 20% depth up to surface (0)
		const bankProgress = (distance - halfWidth) / bankSlope
		const t = bankProgress * bankProgress * (3 - 2 * bankProgress)
		return 0.2 * (1 - t)
	}

	return 0
}
