// Terrain orchestrator - coordinates all terrain features to produce final height values
// This is the main entry point for terrain height calculation
// Now uses a unified procedural system for infinite terrain generation

import { Vector3 } from 'three'
import { TERRAIN_CONFIG, CONTINENTAL_CONFIG } from '../../config/terrain'
import { getContinentalValue, getBeachBlend, isWaterBody } from './features/continental'
import { blendWaterBodyTerrain } from './features/waterBodies'
import { getMountainContribution } from './features/mountains'
import { applyRiverCarving } from './features/rivers'
import { getStagingBlend } from './features/staging'

// Epsilon for numerical gradient approximation
const GRADIENT_EPSILON = 0.01

/**
 * Creates terrain helper functions for height and normal sampling.
 * These helpers encapsulate all the terrain generation logic and provide
 * a clean API for the rest of the terrain system.
 *
 * @param {Object} noise - Noise instance from noisejs
 * @returns {Object} Object with getNormalizedHeight, getWorldHeight, getNormal, and getContinental functions
 */
export const createTerrainHelpers = (noise) => {
	const { baseHeightScale, smoothness, regionScale } = TERRAIN_CONFIG
	const { heightInfluence } = CONTINENTAL_CONFIG

	/**
	 * Get normalized height value at any world position (0-1 range, can go negative for water).
	 * This is the core terrain generation function that combines all features.
	 * The terrain is fully procedural and infinite.
	 *
	 * @param {number} worldX - World X coordinate
	 * @param {number} worldZ - World Z coordinate
	 * @returns {number} Normalized height value (will be multiplied by baseHeightScale for world units)
	 */
	const getNormalizedHeight = (worldX, worldZ) => {
		const distSq = worldX * worldX + worldZ * worldZ

		// 1. Get continental value - determines land vs water at large scale
		const continental = getContinentalValue(worldX, worldZ, noise)

		// 2. Get beach blend - how far inland we are from water edges
		const beachBlend = getBeachBlend(continental)

		// 3. Calculate base terrain noise (gentle rolling terrain)
		const noiseValue = noise.perlin2(worldX / smoothness, worldZ / smoothness)
		const normalizedHeight = (noiseValue + 1) / 2

		// 4. Regional height modulation - creates dispersed flatter areas
		const regionNoise = noise.perlin2(worldX / regionScale + 100, worldZ / regionScale + 100)
		// Map to 0.1-1.0 range: some areas have 10% height (much flatter), others full height
		const regionModifier = 0.1 + (regionNoise + 1) * 0.45

		// 5. Continental height influence - terrain is higher further inland
		// This creates natural elevation gradients from coast to interior
		const continentalLift = Math.max(0, continental) * heightInfluence

		// 6. Apply staging area blend - smooth transition from flat spawn to terrain
		const stagingBlend = getStagingBlend(distSq)

		// 7. Combine base terrain factors
		let baseHeight = normalizedHeight * stagingBlend * regionModifier
		// Add continental lift to raise inland areas
		baseHeight = baseHeight + continentalLift * stagingBlend

		// 8. Add mountain height - now based on continental value and noise patterns
		const mountainHeight = getMountainContribution(worldX, worldZ, noise, continental, beachBlend)

		// 9. Combine base terrain with mountains
		// Base terrain is scaled down in mountain areas to let mountains dominate
		const mountainInfluence = mountainHeight > 0 ? Math.min(1, mountainHeight * 0.5) : 0
		let combinedHeight = baseHeight * (1 - mountainInfluence * 0.7) + mountainHeight

		// 10. Apply procedural river carving (only on land)
		if (!isWaterBody(continental)) {
			combinedHeight = applyRiverCarving(combinedHeight, worldX, worldZ, noise, continental, baseHeightScale)
		}

		// 11. Apply water body blending - handles lakes, seas, and beach transitions
		combinedHeight = blendWaterBodyTerrain(combinedHeight, continental, baseHeightScale, noise, worldX, worldZ)

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

	/**
	 * Get the continental value at a position (for water detection, etc.)
	 *
	 * @param {number} worldX - World X coordinate
	 * @param {number} worldZ - World Z coordinate
	 * @returns {number} Continental value (-1 to 1)
	 */
	const getContinental = (worldX, worldZ) => {
		return getContinentalValue(worldX, worldZ, noise)
	}

	/**
	 * Check if a position is in a water body (lake, sea, etc.)
	 *
	 * @param {number} worldX - World X coordinate
	 * @param {number} worldZ - World Z coordinate
	 * @returns {boolean} True if position is in water
	 */
	const isWater = (worldX, worldZ) => {
		const continental = getContinentalValue(worldX, worldZ, noise)
		return isWaterBody(continental)
	}

	return { getNormalizedHeight, getWorldHeight, getNormal, getContinental, isWater, baseHeightScale }
}
