// Mountain terrain feature
// Handles mountain height generation using ridge noise and domain warping
// Mountains now appear procedurally based on noise, creating infinite mountain ranges

import { getRidgeNoise, getDomainWarp } from '../noise'
import { MOUNTAIN_CONFIG } from '../../../config/terrain'

/**
 * Get the mountain range potential at a position.
 * This determines WHERE mountains can appear (like a mask).
 * Uses large-scale noise to create distinct mountain ranges.
 *
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} noise - Noise instance from noisejs
 * @returns {number} Mountain range potential (0 = no mountains, 1 = full mountains)
 */
const getMountainRangePotential = (worldX, worldZ, noise) => {
	const { rangeScale, rangeThreshold } = MOUNTAIN_CONFIG

	// Large-scale noise for mountain range locations
	// Use ridge noise to create elongated mountain ranges
	const rangeNoise1 = getRidgeNoise(worldX, worldZ, noise, rangeScale)
	const rangeNoise2 = getRidgeNoise(worldX + 5000, worldZ + 5000, noise, rangeScale * 0.7)

	// Combine for more complex range patterns
	const rangeValue = rangeNoise1 * 0.6 + rangeNoise2 * 0.4

	// Apply threshold - mountains only appear where range noise is high enough
	if (rangeValue < rangeThreshold) {
		return 0
	}

	// Smooth transition from threshold to full mountains
	const t = (rangeValue - rangeThreshold) / (1 - rangeThreshold)
	return t * t * (3 - 2 * t) // smoothstep
}

/**
 * Fractal Brownian Motion with ridged noise for mountains.
 * Combines multiple noise octaves with domain warping for natural shapes.
 *
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} noise - Noise instance from noisejs
 * @returns {number} Mountain height (normalized 0-1+)
 */
const getMountainNoise = (worldX, worldZ, noise) => {
	const { baseScale, ridgeScale, detailScale, warpScale, warpStrength } = MOUNTAIN_CONFIG

	// Domain warping - displaces sample position for more organic shapes
	const { wx, wz } = getDomainWarp(worldX, worldZ, noise, warpScale, warpStrength)

	// Base large-scale mountain shapes
	const base =
		noise.perlin2(wx * baseScale, wz * baseScale) * 0.5 +
		noise.perlin2(wx * baseScale * 2.3, wz * baseScale * 2.3) * 0.25 +
		noise.perlin2(wx * baseScale * 5.1, wz * baseScale * 5.1) * 0.125

	// Ridge noise for sharp peaks
	const ridge1 = getRidgeNoise(wx, wz, noise, ridgeScale)
	const ridge2 = getRidgeNoise(wx + 100, wz + 100, noise, ridgeScale * 1.7)
	const ridges = ridge1 * ridge1 * 0.6 + ridge2 * ridge2 * 0.4

	// Combine base and ridges
	let height = (base + 0.5) * 0.4 + ridges * 0.6

	// Valley carving using noise
	const valleyNoise = noise.perlin2(worldX * 0.001 + 200, worldZ * 0.001 + 200)
	const valleyFactor = Math.max(0, valleyNoise) * 0.5
	height = height * (1 - valleyFactor * 0.5)

	// Add fine detail
	const detail =
		noise.perlin2(wx * detailScale, wz * detailScale) * 0.1 +
		noise.perlin2(wx * detailScale * 2.1, wz * detailScale * 2.1) * 0.05

	height += detail

	// Ensure positive and apply power curve for more dramatic peaks
	height = Math.max(0, height)
	height = Math.pow(height, 1.3)

	return height
}

/**
 * Calculate mountain height contribution at a world position.
 * Mountains now appear based on noise patterns and continental value,
 * creating infinite procedural mountain ranges.
 *
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} noise - Noise instance from noisejs
 * @param {number} continentalValue - Continental noise value (mountains only appear inland)
 * @param {number} beachBlend - Beach blend factor (suppress mountains near water)
 * @returns {number} Mountain height contribution (normalized units)
 */
export const getMountainContribution = (worldX, worldZ, noise, continentalValue, beachBlend) => {
	const { minContinental, maxHeight } = MOUNTAIN_CONFIG

	// Mountains only appear in sufficiently inland areas
	if (continentalValue < minContinental) {
		return 0
	}

	// Get mountain range potential (where can mountains appear?)
	const rangePotential = getMountainRangePotential(worldX, worldZ, noise)

	if (rangePotential <= 0) {
		return 0
	}

	// Continental influence - mountains are taller further inland
	const continentalFactor = Math.min(1, (continentalValue - minContinental) / 0.5)

	// Beach influence - suppress mountains near shores
	const beachSuppression = beachBlend * beachBlend // Quadratic for smooth transition

	// Get mountain noise and apply all factors
	const rawMountainHeight = getMountainNoise(worldX, worldZ, noise)

	// Scale to normalized units (will be multiplied by baseHeightScale later)
	return rawMountainHeight * (maxHeight / 4) * rangePotential * continentalFactor * beachSuppression
}
