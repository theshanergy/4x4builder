// River/Valley Utilities
// Functions for infinite valleys with noise-based spacing and river carving.

import RIVER_CONFIG from '../../config/rivers.js'

const { valleySpacing, valleySpacingVariation, primaryFrequency, primaryAmplitude, secondaryFrequency, secondaryAmplitude, tertiaryAmplitude, width, widthVariation, bankSlope } = RIVER_CONFIG

/**
 * Get the base Z position for a valley at a given index.
 * Uses noise to vary the spacing between valleys for natural appearance.
 */
const getValleyBaseZ = (valleyIndex, noise) => {
	// Base position from regular spacing
	const baseZ = valleyIndex * valleySpacing

	// Add noise-based offset for irregular spacing
	if (noise && valleySpacingVariation > 0) {
		// Use valley index as seed for consistent offset per valley
		const offset = noise.perlin2(valleyIndex * 0.7 + 500, 0.3) * valleySpacing * valleySpacingVariation
		return baseZ + offset
	}

	return baseZ
}

/**
 * Find the nearest valley index for a given Z position.
 * Checks neighboring valleys to find the actual closest one.
 */
const getNearestValleyIndex = (z, noise) => {
	// Start with estimated index based on regular spacing
	const estimatedIndex = Math.round(z / valleySpacing)

	// Check this and neighboring valleys to find closest
	let nearestIndex = estimatedIndex
	let nearestDistance = Infinity

	for (let i = estimatedIndex - 2; i <= estimatedIndex + 2; i++) {
		const valleyZ = getValleyBaseZ(i, noise)
		const dist = Math.abs(z - valleyZ)
		if (dist < nearestDistance) {
			nearestDistance = dist
			nearestIndex = i
		}
	}

	return nearestIndex
}

/**
 * Calculate the Z position of the river center at a given world position.
 * Finds the nearest valley and applies meandering within that valley.
 */
export const getRiverCenterZ = (x, noise) => {
	// For initial calculation, use x=0 to get a stable valley index
	// Then calculate meander relative to that valley's base
	const sampleZ = 0 // We need a Z to find the valley, use origin
	const valleyIndex = getNearestValleyIndex(sampleZ, noise)
	const valleyBaseZ = getValleyBaseZ(valleyIndex, noise)

	// Apply meandering relative to valley base
	const primary = Math.sin(x * primaryFrequency) * primaryAmplitude
	const secondary = Math.sin(x * secondaryFrequency + 1.5) * secondaryAmplitude
	const tertiary = noise ? noise.perlin2(x * 0.003 + valleyIndex * 100, 0.5) * tertiaryAmplitude : 0

	return valleyBaseZ + primary + secondary + tertiary
}

/**
 * Get info about the nearest valley to a world position.
 * Returns the valley's river center Z and distance to it.
 */
export const getNearestValley = (worldX, worldZ, noise) => {
	const valleyIndex = getNearestValleyIndex(worldZ, noise)
	const valleyBaseZ = getValleyBaseZ(valleyIndex, noise)

	// Apply meandering for this X position
	const primary = Math.sin(worldX * primaryFrequency) * primaryAmplitude
	const secondary = Math.sin(worldX * secondaryFrequency + 1.5) * secondaryAmplitude
	const tertiary = noise ? noise.perlin2(worldX * 0.003 + valleyIndex * 100, 0.5) * tertiaryAmplitude : 0

	const riverCenterZ = valleyBaseZ + primary + secondary + tertiary
	const distanceToValley = Math.abs(worldZ - riverCenterZ)

	return {
		valleyIndex,
		valleyBaseZ,
		riverCenterZ,
		distanceToValley,
	}
}

/**
 * Calculate river width at a given position.
 * Width varies using noise for natural appearance.
 */
export const getRiverWidth = (x, noise, valleyIndex = 0) => {
	const variation = noise ? noise.perlin2(x * 0.005 + 100 + valleyIndex * 50, 0.5) * widthVariation : 0
	return width + variation
}

/**
 * Calculate distance from a world position to the nearest river.
 */
export const getDistanceToRiver = (worldX, worldZ, noise) => {
	const { riverCenterZ, valleyIndex } = getNearestValley(worldX, worldZ, noise)
	const riverWidth = getRiverWidth(worldX, noise, valleyIndex)
	const distance = Math.abs(worldZ - riverCenterZ)
	return { distance, riverZ: riverCenterZ, riverWidth, valleyIndex }
}

/**
 * Calculate how deeply the river should carve into terrain at a given position.
 * Returns 0-1 where 0 = no carving, 1 = maximum depth at river center.
 */
export const getRiverDepthFactor = (worldX, worldZ, noise) => {
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
