// Unified terrain height sampler
// Single coherent noise function produces all terrain features:
// continents, mountains, valleys - without separate "feature" systems
// Water is simply wherever terrain height < water level (no special casing)

import { Vector3 } from 'three'

import TERRAIN_CONFIG from '../../config/terrain'
import WATER_CONFIG from '../../config/water'

// Epsilon for numerical gradient approximation
const GRADIENT_EPSILON = 0.01

/**
 * Creates terrain helper functions for height and normal sampling.
 * Uses a unified noise approach - one coherent function produces all terrain features.
 *
 * @param {Object} noise - Noise instance from noisejs
 * @returns {Object} Object with getHeight, getNormal, and isWater functions
 */
export const createTerrainHelpers = (noise) => {
	const { baseFrequency, baseAmplitude, continentScale, mountainScale, maxMountainHeight, spawnRadius, spawnTransitionRadius } = TERRAIN_CONFIG

	const spawnRadiusSq = spawnRadius * spawnRadius
	const transitionEndSq = spawnTransitionRadius * spawnTransitionRadius

	/**
	 * Smoothstep interpolation (cubic hermite)
	 */
	const smoothstep = (t) => {
		const c = Math.max(0, Math.min(1, t))
		return c * c * (3 - 2 * c)
	}

	/**
	 * Get unified terrain height at any world position.
	 *
	 * Single continuous function - no land/water branching.
	 * Water is simply wherever terrain height < water level.
	 * This eliminates shoreline artifacts from discontinuous functions.
	 *
	 * Each layer handles its own scaling:
	 * - Layer 1 (Continental): Scaled to create proper water depth range
	 * - Layer 2 (Base terrain): Frequency and amplitude for rolling hills
	 * - Layer 3 (Mountains): Scaled by maxMountainHeight for peaks
	 *
	 * @param {number} x - World X coordinate
	 * @param {number} z - World Z coordinate
	 * @returns {number} Height value in world units
	 */
	const getHeight = (x, z) => {
		const distSq = x * x + z * z

		// === SPAWN AREA: Flat spawn zone (check first for early return) ===
		if (distSq < spawnRadiusSq) {
			return 0
		}

		const dist = Math.sqrt(distSq)

		// === LAYER 1: Continental shape (very large scale) ===
		// Domain warp for organic coastlines
		const warpX = noise.perlin2(x * continentScale * 0.7 + 50, z * continentScale * 0.7 + 50) * 800
		const warpZ = noise.perlin2(x * continentScale * 0.7 + 150, z * continentScale * 0.7 + 150) * 800
		const wx = x + warpX
		const wz = z + warpZ

		// Continental noise - this is the primary driver of elevation
		// Ranges roughly -1 to 1, centered around 0
		let continental = noise.perlin2(wx * continentScale, wz * continentScale) * 0.7 + noise.perlin2(wx * continentScale * 2.5, wz * continentScale * 2.5) * 0.3

		// Vary shoreline sharpness along the coast using continental noise
		// This creates organic variation - some areas have sharp cliffs, others gentle slopes
		const shorelineVariation = noise.perlin2(x * continentScale * 0.4 + 500, z * continentScale * 0.4 + 500)
		const shorelineSharpness = 1.85 + shorelineVariation * 5.0 // Range (gentler to sharper)
		continental = Math.sign(continental) * Math.pow(Math.abs(continental), 1.0 / shorelineSharpness)

		// === LAYER 2: Base terrain variation (rolling hills) ===
		// Normalized noise (-1 to 1 range) scaled by baseAmplitude
		const baseNoise =
			(noise.perlin2(x * baseFrequency, z * baseFrequency) * 0.6 +
				noise.perlin2(x * baseFrequency * 2.2, z * baseFrequency * 2.2) * 0.3 +
				noise.perlin2(x * baseFrequency * 4.5, z * baseFrequency * 4.5) * 0.1) *
			baseAmplitude

		// === LAYER 3: Mountains (only where continental is high) ===
		const inlandFactor = smoothstep(continental / 0.6)

		const ridge1 = 1 - Math.abs(noise.perlin2(x * mountainScale, z * mountainScale))
		const ridge2 = 1 - Math.abs(noise.perlin2(x * mountainScale * 1.8 + 100, z * mountainScale * 1.8 + 100))
		const ridgeNoise = ridge1 * ridge1 * 0.6 + ridge2 * ridge2 * 0.4

		const mountainMask = noise.perlin2(x * mountainScale * 0.3 + 500, z * mountainScale * 0.3 + 500)
		const mountainFactor = smoothstep((mountainMask + 0.3) / 0.8) * inlandFactor

		// Mountains scaled by maxMountainHeight directly (no baseHeightScale needed)
		const mountainHeight = ridgeNoise * mountainFactor * maxMountainHeight

		// === COMBINE: Continental drives overall elevation ===
		// Continental value directly sets base elevation (can go negative for lakes)
		// Only add base noise variation when we're safely above water (prevents tiny lakes)
		// Base noise adds rolling hills on land, mountains add peaks on high ground
		// Continental multiplier calculated from desired max depth (in world units)
		const continentalMultiplier = WATER_CONFIG.maxDepth + Math.abs(WATER_CONFIG.level)
		const baseHeight = continental * continentalMultiplier
		let height = baseHeight

		// Only apply fine-grained terrain variation well above water level
		// Use a smooth fade so terrain doesn't suddenly become flat near water
		const waterThreshold = WATER_CONFIG.level // Water level in world units
		const safetyMargin = 2.0 // Extra margin in world units to prevent noise from creating tiny lakes
		const minSafeHeight = waterThreshold + safetyMargin

		if (baseHeight > minSafeHeight) {
			// Safely above water - apply full noise variation
			height += baseNoise * 0.5
		} else if (baseHeight > waterThreshold) {
			// Near water - fade out noise to prevent creating tiny lakes
			const fadeFactor = (baseHeight - waterThreshold) / safetyMargin
			height += Math.max(0, baseNoise) * 0.5 * fadeFactor // Only additive noise near water
		}

		// Below water threshold: no noise, lakes stay smooth
		height += mountainHeight

		// === SPAWN AREA: Smooth transition from flat spawn to natural terrain ===
		if (distSq < transitionEndSq) {
			const t = (dist - spawnRadius) / (spawnTransitionRadius - spawnRadius)
			const blend = t * t * t * (t * (t * 6 - 15) + 10) // Quintic smoothstep
			height *= blend // Blend from 0 (flat) to full terrain height
		}

		return height
	}

	/**
	 * Get terrain normal using numerical gradient.
	 */
	const getNormal = (x, z, target = new Vector3()) => {
		const dist = Math.sqrt(x * x + z * z)
		const epsilon = dist > 500 ? GRADIENT_EPSILON * 4 : GRADIENT_EPSILON

		const hL = getHeight(x - epsilon, z)
		const hR = getHeight(x + epsilon, z)
		const hD = getHeight(x, z - epsilon)
		const hU = getHeight(x, z + epsilon)

		const dhdx = (hR - hL) / (2 * epsilon)
		const dhdz = (hU - hD) / (2 * epsilon)

		return target.set(-dhdx, 1, -dhdz).normalize()
	}

	/**
	 * Check if a position is in water (terrain below water level).
	 */
	const isWater = (x, z) => {
		return getHeight(x, z) < WATER_CONFIG.level
	}

	return {
		getHeight,
		getNormal,
		isWater,
	}
}
