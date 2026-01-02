// Mountain terrain feature
// Handles mountain height generation using ridge noise and domain warping

import { getRidgeNoise, getDomainWarp } from '../noise'
import { MOUNTAIN_CONFIG, OCEAN_CONFIG } from '../../../config/terrain'

/**
 * Fractal Brownian Motion with ridged noise for mountains.
 * Combines multiple noise octaves with domain warping for natural shapes.
 * 
 * @param {Object} noise - Noise instance from noisejs
 * @param {number} x - World X coordinate
 * @param {number} z - World Z coordinate
 * @returns {number} Mountain height (normalized 0-1+)
 */
export const getMountainNoise = (noise, x, z) => {
	const { baseScale, ridgeScale, detailScale, warpScale, warpStrength, valleyScale, valleyDepth } = MOUNTAIN_CONFIG

	// Domain warping - displaces sample position for more organic shapes
	const { wx, wz } = getDomainWarp(noise, x, z, warpScale, warpStrength)

	// Base large-scale mountain shapes
	const base =
		noise.perlin2(wx * baseScale, wz * baseScale) * 0.5 +
		noise.perlin2(wx * baseScale * 2.3, wz * baseScale * 2.3) * 0.25 +
		noise.perlin2(wx * baseScale * 5.1, wz * baseScale * 5.1) * 0.125

	// Ridge noise for sharp peaks
	const ridge1 = getRidgeNoise(noise, wx, wz, ridgeScale)
	const ridge2 = getRidgeNoise(noise, wx + 100, wz + 100, ridgeScale * 1.7)
	const ridges = ridge1 * ridge1 * 0.6 + ridge2 * ridge2 * 0.4

	// Combine base and ridges
	let height = (base + 0.5) * 0.4 + ridges * 0.6

	// Apply valley carving - creates river-like valleys
	const valleyNoise = noise.perlin2(x * valleyScale + 200, z * valleyScale + 200)
	const valleyFactor = Math.max(0, valleyNoise) * valleyDepth
	height = height * (1 - valleyFactor * 0.5)

	// Add fine detail
	const detail = noise.perlin2(wx * detailScale, wz * detailScale) * 0.1 + noise.perlin2(wx * detailScale * 2.1, wz * detailScale * 2.1) * 0.05

	height += detail

	// Ensure positive and apply power curve for more dramatic peaks
	height = Math.max(0, height)
	height = Math.pow(height, 1.3)

	return height
}

/**
 * Calculate mountain height contribution at a world position.
 * Mountains appear in parallel bands along the X axis on both sides of origin.
 * 
 * @param {Object} noise - Noise instance from noisejs
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {number} distSq - Squared distance from origin
 * @returns {number} Mountain height contribution (normalized units)
 */
export const getMountainHeight = (noise, worldX, worldZ, distSq) => {
	const dist = Math.sqrt(distSq)
	const absZ = Math.abs(worldZ) // Use absolute Z for symmetric bands on both sides

	// Mountains only appear beyond startDistance and before ocean transition
	if (absZ <= MOUNTAIN_CONFIG.startDistance || dist >= OCEAN_CONFIG.radius - OCEAN_CONFIG.transition * 0.5) {
		return 0
	}

	// Calculate blend factor for mountains based on Z distance
	let mountainBlend = 1
	const mountainFullZ = MOUNTAIN_CONFIG.startDistance + MOUNTAIN_CONFIG.transitionWidth

	if (absZ < mountainFullZ) {
		// In transition zone - smooth blend in
		const t = (absZ - MOUNTAIN_CONFIG.startDistance) / MOUNTAIN_CONFIG.transitionWidth
		// Use smoothstep for natural transition
		mountainBlend = t * t * (3 - 2 * t)
	}

	// Reduce mountains near ocean to create beaches
	const oceanProximity = (OCEAN_CONFIG.radius - OCEAN_CONFIG.transition * 2 - dist) / (OCEAN_CONFIG.transition * 3)
	const oceanFade = Math.min(1, Math.max(0, oceanProximity))

	// Get mountain noise and apply blend
	const rawMountainHeight = getMountainNoise(noise, worldX, worldZ)
	// Scale to normalized units (will be multiplied by baseHeightScale later)
	return rawMountainHeight * (MOUNTAIN_CONFIG.maxHeight / 4) * mountainBlend * oceanFade
}
