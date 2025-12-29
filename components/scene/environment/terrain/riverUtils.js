// River Utilities

// Functions for calculating river path, width, and terrain carving depth.

import { RIVER_CONFIG } from './config'

/**
 * Calculate the Z position of the river center at a given X coordinate.
 * The river meanders using multiple sine waves plus noise for organic variation.
 */
export const getRiverCenterZ = (x, noise) => {
	const { baseZ, primaryFrequency, primaryAmplitude, secondaryFrequency, secondaryAmplitude, tertiaryAmplitude } = RIVER_CONFIG
	const primary = Math.sin(x * primaryFrequency) * primaryAmplitude
	const secondary = Math.sin(x * secondaryFrequency + 1.5) * secondaryAmplitude
	const tertiary = noise ? noise.perlin2(x * 0.003, 0.5) * tertiaryAmplitude : 0
	return baseZ + primary + secondary + tertiary
}

/**
 * Calculate river width at a given X coordinate.
 * Width varies slightly using noise for natural appearance.
 */
export const getRiverWidth = (x, noise) => {
	const { width, widthVariation } = RIVER_CONFIG
	const variation = noise ? noise.perlin2(x * 0.005 + 100, 0.5) * widthVariation : 0
	return width + variation
}

/**
 * Calculate distance from a world position to the nearest point on the river.
 * Returns an object with distance and river geometry info at that X position.
 */
export const getDistanceToRiver = (worldX, worldZ, noise) => {
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
 */
export const getRiverDepthFactor = (worldX, worldZ, noise) => {
	const { startX, endX, bankSlope } = RIVER_CONFIG

	// Early exit if outside river bounds
	if (worldX < startX - bankSlope * 2 || worldX > endX + bankSlope * 2) return 0

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
