// Unified terrain height sampler
// Single coherent noise function produces all terrain features:
// continents, mountains, valleys - without separate "feature" systems
// Water is simply wherever terrain height < water level (no special casing)

import { Vector3 } from 'three'
import { WATER_LEVEL } from '../../config/water'

// Epsilon for numerical gradient approximation
const GRADIENT_EPSILON = 0.01

/**
 * Creates terrain helper functions for height and normal sampling.
 * Uses a unified noise approach - one coherent function produces all terrain features.
 *
 * @param {Object} noise - Noise instance from noisejs
 * @param {Object} terrainConfig - Terrain configuration object from biome
 * @param {Object} waterConfig - Water configuration object from biome (optional)
 * @returns {Object} Object with getNormalizedHeight, getWorldHeight, getNormal, and isWater functions
 */
export const createTerrainHelpers = (noise, terrainConfig, waterConfig = { maxDepth: 50 }) => {
	const { baseHeightScale, noiseScale, continentScale, mountainScale, maxMountainHeight, spawnRadius, spawnTransitionRadius } = terrainConfig
	const WATER_BODY_CONFIG = waterConfig

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
	 * @param {number} x - World X coordinate
	 * @param {number} z - World Z coordinate
	 * @returns {number} Normalized height value
	 */
	const getNormalizedHeight = (x, z) => {
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

		// Bias terrain upward to reduce lake coverage (shift from ~50% water to ~20% water)
		continental += 0.1

		// Spawn area land guarantee - ensure spawn zone is always on land
		if (dist < spawnRadius) {
			continental = Math.max(continental, 0.3)
		}

		// Vary shoreline sharpness along the coast using continental noise
		// This creates organic variation - some areas have sharp cliffs, others gentle slopes
		const shorelineVariation = noise.perlin2(x * continentScale * 0.4 + 500, z * continentScale * 0.4 + 500)
		const shorelineSharpness = 1.85 + shorelineVariation * 5.0 // Range (gentler to sharper)
		continental = Math.sign(continental) * Math.pow(Math.abs(continental), 1.0 / shorelineSharpness)

		// === LAYER 2: Base terrain variation ===
		const baseNoise =
			noise.perlin2(x * noiseScale, z * noiseScale) * 0.6 +
			noise.perlin2(x * noiseScale * 2.2, z * noiseScale * 2.2) * 0.3 +
			noise.perlin2(x * noiseScale * 4.5, z * noiseScale * 4.5) * 0.1

		// === LAYER 3: Mountains (only where continental is high) ===
		const inlandFactor = smoothstep(continental / 0.6)

		const ridge1 = 1 - Math.abs(noise.perlin2(x * mountainScale, z * mountainScale))
		const ridge2 = 1 - Math.abs(noise.perlin2(x * mountainScale * 1.8 + 100, z * mountainScale * 1.8 + 100))
		const ridgeNoise = ridge1 * ridge1 * 0.6 + ridge2 * ridge2 * 0.4

		const mountainMask = noise.perlin2(x * mountainScale * 0.3 + 500, z * mountainScale * 0.3 + 500)
		const mountainFactor = smoothstep((mountainMask + 0.3) / 0.8) * inlandFactor

		const mountainHeight = ridgeNoise * mountainFactor * (maxMountainHeight / baseHeightScale)

		// === COMBINE: Continental drives overall elevation ===
		// Continental value directly sets base elevation (can go negative for lakes)
		// Only add base noise variation when we're safely above water (prevents tiny lakes)
		// Base noise adds rolling hills on land, mountains add peaks on high ground
		// Continental multiplier calculated from desired max depth:
		// maxDepth (in world units) / baseHeightScale gives normalized depth needed
		const continentalMultiplier = (WATER_BODY_CONFIG.maxDepth + Math.abs(WATER_LEVEL)) / baseHeightScale
		const baseHeight = continental * continentalMultiplier
		let height = baseHeight

		// Only apply fine-grained terrain variation well above water level
		// Use a smooth fade so terrain doesn't suddenly become flat near water
		// Water level is -1 (scaled by baseHeightScale=4, so -0.25 in normalized space)
		// We want base terrain to be at least 0.2 above water before adding variation
		const waterThreshold = -0.25 // WATER_LEVEL / baseHeightScale
		const safetyMargin = 0.5 // Extra margin to prevent noise from creating tiny lakes
		const minSafeHeight = waterThreshold + safetyMargin // -0.25 + 0.5 = 0.25

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
	 * Get terrain height in world units.
	 */
	const getWorldHeight = (x, z) => {
		return getNormalizedHeight(x, z) * baseHeightScale
	}

	/**
	 * Get terrain normal using numerical gradient.
	 */
	const getNormal = (x, z, target = new Vector3()) => {
		const dist = Math.sqrt(x * x + z * z)
		const epsilon = dist > 500 ? GRADIENT_EPSILON * 4 : GRADIENT_EPSILON

		const hL = getWorldHeight(x - epsilon, z)
		const hR = getWorldHeight(x + epsilon, z)
		const hD = getWorldHeight(x, z - epsilon)
		const hU = getWorldHeight(x, z + epsilon)

		const dhdx = (hR - hL) / (2 * epsilon)
		const dhdz = (hU - hD) / (2 * epsilon)

		return target.set(-dhdx, 1, -dhdz).normalize()
	}

	/**
	 * Check if a position is in water (terrain below water level).
	 */
	const isWater = (x, z) => {
		return getWorldHeight(x, z) < WATER_LEVEL
	}

	return {
		getNormalizedHeight,
		getWorldHeight,
		getNormal,
		isWater,
		baseHeightScale,
	}
}
