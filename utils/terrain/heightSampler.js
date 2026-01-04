// Terrain orchestrator - coordinates all terrain features to produce final height values
// This is the main entry point for terrain height calculation

import { Vector3 } from 'three'
import { TERRAIN_CONFIG } from '../../config/terrain'
import { WATER_LEVEL, RIVER_CONFIG } from '../../config/water'
import { getMountainContribution } from './features/mountains'
import { blendOceanDepth } from './features/ocean'
import { getRiverBlendFactor } from './features/river/terrain'
import { getStagingBlend } from './features/staging'

// Epsilon for numerical gradient approximation
const GRADIENT_EPSILON = 0.01

/**
 * Creates terrain helper functions for height and normal sampling.
 * These helpers encapsulate all the terrain generation logic and provide
 * a clean API for the rest of the terrain system.
 *
 * @param {Object} noise - Noise instance from noisejs
 * @returns {Object} Object with getNormalizedHeight, getWorldHeight, and getNormal functions
 */
export const createTerrainHelpers = (noise) => {
	const { baseHeightScale, smoothness, regionScale } = TERRAIN_CONFIG

	/**
	 * Get normalized height value at any world position (0-1 range, can go negative for ocean).
	 * This is the core terrain generation function that combines all features.
	 *
	 * @param {number} worldX - World X coordinate
	 * @param {number} worldZ - World Z coordinate
	 * @returns {number} Normalized height value (will be multiplied by baseHeightScale for world units)
	 */
	const getNormalizedHeight = (worldX, worldZ) => {
		const distSq = worldX * worldX + worldZ * worldZ

		// Calculate base terrain noise (gentle rolling terrain)
		const noiseValue = noise.perlin2(worldX / smoothness, worldZ / smoothness)
		const normalizedHeight = (noiseValue + 1) / 2

		// Regional height modulation - creates dispersed flatter areas
		const regionNoise = noise.perlin2(worldX / regionScale + 100, worldZ / regionScale + 100)
		// Map to 0.1-1.0 range: some areas have 10% height (much flatter), others full height
		const regionModifier = 0.1 + (regionNoise + 1) * 0.45

		// Apply staging area blend - smooth transition from flat spawn to terrain
		const stagingBlend = getStagingBlend(distSq)
		const baseHeight = normalizedHeight * stagingBlend * regionModifier

		// Add mountain height using parallel bands along the X axis
		const mountainHeight = getMountainContribution(worldX, worldZ, noise, distSq)

		// Combine base terrain with mountains
		// Base terrain is scaled down in mountain areas to let mountains dominate
		const mountainInfluence = mountainHeight > 0 ? Math.min(1, mountainHeight * 0.5) : 0
		let combinedHeight = baseHeight * (1 - mountainInfluence * 0.7) + mountainHeight

		// Apply river carving BEFORE ocean transition so river cuts through beach
		const riverBlendFactor = getRiverBlendFactor(worldX, worldZ)
		if (riverBlendFactor > 0) {
			// Carve river bed into terrain - depth is relative to water level
			// At river center (blendFactor=1): 95% terrain suppressed, 5% variance
			// At river edges (blendFactor=0): full terrain height
			const normalizedRiverDepth = RIVER_CONFIG.depth / baseHeightScale
			const varianceRetention = 1 - riverBlendFactor * 0.95
			const carvedHeight = combinedHeight * varianceRetention - riverBlendFactor * normalizedRiverDepth
			const riverBedFloor = WATER_LEVEL / baseHeightScale - normalizedRiverDepth * 1.1
			combinedHeight = Math.max(carvedHeight, riverBedFloor)
		}

		// Apply ocean blending - creates realistic beach profile and ocean depth
		combinedHeight = blendOceanDepth(combinedHeight, distSq, baseHeightScale)

		return combinedHeight
	}

	/**
	 * Get terrain height at any world position (in world units).
	 * This is a convenience wrapper around getNormalizedHeight.
	 *
	 * @param {number} worldX - World X coordinate
	 * @param {number} worldZ - World Z coordinate
	 * @returns {number} Height in world units
	 */
	const getWorldHeight = (worldX, worldZ) => {
		return getNormalizedHeight(worldX, worldZ) * baseHeightScale
	}

	/**
	 * Get terrain normal at any world position using numerical gradient.
	 * Uses central differences to approximate the terrain slope in X and Z directions.
	 *
	 * @param {number} worldX - World X coordinate
	 * @param {number} worldZ - World Z coordinate
	 * @param {Vector3} target - Optional target vector to store result
	 * @returns {Vector3} Normalized surface normal
	 */
	const getNormal = (worldX, worldZ, target = new Vector3()) => {
		// Use larger epsilon for distant terrain to avoid noise artifacts
		const dist = Math.sqrt(worldX * worldX + worldZ * worldZ)
		const epsilon = dist > 500 ? GRADIENT_EPSILON * 4 : GRADIENT_EPSILON

		// Sample height at four neighboring points
		const hL = getNormalizedHeight(worldX - epsilon, worldZ) * baseHeightScale
		const hR = getNormalizedHeight(worldX + epsilon, worldZ) * baseHeightScale
		const hD = getNormalizedHeight(worldX, worldZ - epsilon) * baseHeightScale
		const hU = getNormalizedHeight(worldX, worldZ + epsilon) * baseHeightScale

		// Calculate partial derivatives using central differences
		const dhdx = (hR - hL) / (2 * epsilon)
		const dhdz = (hU - hD) / (2 * epsilon)

		// Normal is perpendicular to the tangent plane
		// Cross product of tangent vectors gives normal: (-dhdx, 1, -dhdz)
		return target.set(-dhdx, 1, -dhdz).normalize()
	}

	return { getNormalizedHeight, getWorldHeight, getNormal, baseHeightScale }
}
