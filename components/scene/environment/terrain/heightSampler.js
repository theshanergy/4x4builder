// Terrain Height Calculation

// Core height sampling logic including noise generation, mountains, ocean,
// river carving, and normal calculation.

import { OCEAN_RADIUS, OCEAN_TRANSITION, OCEAN_DEPTH, BEACH_MIDPOINT_DEPTH, MOUNTAIN_CONFIG, REGION_SCALE, GRADIENT_EPSILON, RIVER_CONFIG } from './config'
import { getRiverDepthFactor } from './riverUtils'

/**
 * Ridge noise function - creates sharp mountain ridges.
 * Uses absolute value of noise to create V-shaped valleys and ridges.
 */
const getRidgeNoise = (noise, x, z, scale) => {
	const n = noise.perlin2(x * scale, z * scale)
	// Invert absolute value to get ridges instead of valleys
	return 1 - Math.abs(n)
}

/**
 * Fractal Brownian Motion with ridged noise for mountains.
 * Combines multiple noise octaves with domain warping for natural shapes.
 */
const getMountainNoise = (noise, x, z) => {
	const { baseScale, ridgeScale, detailScale, warpScale, warpStrength, valleyScale, valleyDepth } = MOUNTAIN_CONFIG

	// Domain warping - displaces sample position for more organic shapes
	const warpX = noise.perlin2(x * warpScale + 50, z * warpScale + 50) * warpStrength
	const warpZ = noise.perlin2(x * warpScale + 150, z * warpScale + 150) * warpStrength
	const wx = x + warpX
	const wz = z + warpZ

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
 * Creates terrain helper functions for height and normal sampling.
 * These helpers encapsulate all the terrain generation logic and provide
 * a clean API for the rest of the terrain system.
 *
 * @param {Object} noise - Noise instance from noisejs
 * @param {number} smoothness - Base terrain noise scale
 * @param {number} flatAreaRadius - Radius of flat area around origin
 * @param {number} transitionEndDist - Distance where transition from flat area ends
 * @returns {Object} Object with getRawHeight, getHeight, and getNormal functions
 */
export const createTerrainHelpers = (noise, smoothness, flatAreaRadius, transitionEndDist) => {
	const flatAreaRadiusSq = flatAreaRadius * flatAreaRadius
	const transitionEndDistSq = transitionEndDist * transitionEndDist

	// Ocean boundary calculations
	const oceanTransitionStart = OCEAN_RADIUS - OCEAN_TRANSITION
	const oceanTransitionStartSq = oceanTransitionStart * oceanTransitionStart

	/**
	 * Get raw height value at any world position (normalized 0-1, can go negative for ocean)
	 */
	const getRawHeight = (worldX, worldZ) => {
		const distSq = worldX * worldX + worldZ * worldZ
		const dist = Math.sqrt(distSq)

		// Start with flat area check
		if (distSq < flatAreaRadiusSq) return 0

		// Calculate base terrain noise (existing gentle terrain)
		const noiseValue = noise.perlin2(worldX / smoothness, worldZ / smoothness)
		const normalizedHeight = (noiseValue + 1) / 2

		// Regional height modulation - creates dispersed flatter areas
		const regionNoise = noise.perlin2(worldX / REGION_SCALE + 100, worldZ / REGION_SCALE + 100)
		// Map to 0.1-1.0 range: some areas have 10% height (much flatter), others full height
		const regionModifier = 0.1 + (regionNoise + 1) * 0.45

		let baseHeight
		if (distSq < transitionEndDistSq) {
			const t = (dist - flatAreaRadius) / (transitionEndDist - flatAreaRadius)
			baseHeight = normalizedHeight * (t * t * (3 - 2 * t)) * regionModifier
		} else {
			baseHeight = normalizedHeight * regionModifier
		}

		// Add mountain height using parallel bands along the X axis
		let mountainHeight = 0
		const absZ = Math.abs(worldZ) // Use absolute Z for symmetric bands on both sides

		if (absZ > MOUNTAIN_CONFIG.startDistance && dist < OCEAN_RADIUS - OCEAN_TRANSITION * 0.5) {
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
			const oceanProximity = (OCEAN_RADIUS - OCEAN_TRANSITION * 2 - dist) / (OCEAN_TRANSITION * 3)
			const oceanFade = Math.min(1, Math.max(0, oceanProximity))

			// Get mountain noise and apply blend
			const rawMountainHeight = getMountainNoise(noise, worldX, worldZ)
			// Scale to normalized units (will be multiplied by maxHeight later)
			mountainHeight = rawMountainHeight * (MOUNTAIN_CONFIG.maxHeight / 4) * mountainBlend * oceanFade
		}

		// Combine base terrain with mountains
		// Base terrain is scaled down in mountain areas to let mountains dominate
		const mountainInfluence = mountainHeight > 0 ? Math.min(1, mountainHeight * 0.5) : 0
		const combinedHeight = baseHeight * (1 - mountainInfluence * 0.7) + mountainHeight

		// Apply ocean tapering - realistic two-stage beach profile
		if (distSq > oceanTransitionStartSq) {
			if (dist >= OCEAN_RADIUS) {
				// Beyond ocean radius - full ocean depth (normalized)
				return -OCEAN_DEPTH / 4 // Normalize relative to typical maxHeight
			} else {
				// In transition zone - smooth bezier-like curve through control point
				const t = (dist - oceanTransitionStart) / OCEAN_TRANSITION // 0 at shore, 1 at deep ocean

				const oceanFloorHeight = -OCEAN_DEPTH / 4
				const midpointHeight = oceanFloorHeight * BEACH_MIDPOINT_DEPTH

				// Quadratic bezier interpolation: start at combinedHeight, through midpoint, to oceanFloorHeight
				const bezierT = t * t * (3 - 2 * t) // Smoothstep for natural curve
				let finalHeight

				if (t < 0.5) {
					// Shallow beach section
					const localT = t * 2 // Map to 0-1
					finalHeight = combinedHeight * (1 - localT) + midpointHeight * localT
				} else {
					// Drop-off section
					const localT = (t - 0.5) * 2 // Map to 0-1
					const dropCurve = localT * localT // Quadratic for steeper descent
					finalHeight = midpointHeight * (1 - dropCurve) + oceanFloorHeight * dropCurve
				}

				// Suppress terrain noise as we enter water
				const noiseSuppression = (1 - bezierT) * (1 - bezierT) * (1 - bezierT)
				return combinedHeight * noiseSuppression + finalHeight * (1 - noiseSuppression)
			}
		}

		// Apply river carving
		const riverDepthFactor = getRiverDepthFactor(worldX, worldZ, noise)
		if (riverDepthFactor > 0) {
			// Carve river bed into terrain - needs to go below water level (Y=-1)
			// At river center (depthFactor=1): 95% terrain suppressed, 5% variance
			// At river edges (depthFactor=0): full terrain height
			const normalizedRiverDepth = RIVER_CONFIG.depth / 4
			const varianceRetention = 1 - riverDepthFactor * 0.95
			const carvedHeight = combinedHeight * varianceRetention - riverDepthFactor * normalizedRiverDepth
			return Math.max(carvedHeight, -normalizedRiverDepth * 1.1)
		}

		return combinedHeight
	}

	/**
	 * Get terrain height at any world position (in world units)
	 */
	const getHeight = (worldX, worldZ, maxHeight) => {
		return getRawHeight(worldX, worldZ) * maxHeight
	}

	/**
	 * Get terrain normal at any world position using numerical gradient
	 */
	const getNormal = (worldX, worldZ, maxHeight, target) => {
		// Use larger epsilon for distant terrain to avoid noise artifacts
		const dist = Math.sqrt(worldX * worldX + worldZ * worldZ)
		const epsilon = dist > 500 ? GRADIENT_EPSILON * 4 : GRADIENT_EPSILON

		const hL = getRawHeight(worldX - epsilon, worldZ) * maxHeight
		const hR = getRawHeight(worldX + epsilon, worldZ) * maxHeight
		const hD = getRawHeight(worldX, worldZ - epsilon) * maxHeight
		const hU = getRawHeight(worldX, worldZ + epsilon) * maxHeight

		const dhdx = (hR - hL) / (2 * epsilon)
		const dhdz = (hU - hD) / (2 * epsilon)

		return target.set(-dhdx, 1, -dhdz).normalize()
	}

	return { getRawHeight, getHeight, getNormal }
}
