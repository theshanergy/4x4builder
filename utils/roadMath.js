import { Vector3 } from 'three'
import { Noise } from 'noisejs'

// ============================================================================
// Road Configuration
// ============================================================================

// Road curve parameters - controls the procedural generation
const CURVE_AMP_X = 60 // Lateral curve amplitude
const CURVE_FREQ_X = 0.002 // Lateral curve frequency
const CURVE_OFFSET_X = 0.0005 // Secondary lateral variation

// Terrain sampling parameters for road height
const ROAD_HEIGHT_SAMPLES = 50 // Number of samples to average for smooth road
const ROAD_HEIGHT_SAMPLE_DISTANCE = 120 // Distance ahead/behind to sample
const ROAD_HEIGHT_DAMPING = 0.2 // Reduce terrain height influence on road (0-1)

// Spawn area parameters - road starts straight and flat at origin
const SPAWN_FLAT_RADIUS = 50 // Road is straight and flat within this distance from origin
const SPAWN_TRANSITION_END = 150 // Road fully follows curves/terrain beyond this distance

// Road dimensions - matching reference road profile
export const ROAD_WIDTH = 14 // Total road width (7m half-width)
export const ROAD_SHOULDER_WIDTH = 3 // Shoulder extends 3m beyond road edge
export const ROAD_TRANSITION_WIDTH = 22 // Transition from shoulder to full terrain

// Terrain config needed for road height sampling
const TERRAIN_SMOOTHNESS = 15
const TERRAIN_MAX_HEIGHT = 4

// ============================================================================
// Caching
// ============================================================================

// Cache for getRoadInfo results (key: "x,z" rounded to precision)
const roadInfoCache = new Map()
const ROAD_INFO_CACHE_PRECISION = 0.5 // Cache precision in world units
const ROAD_INFO_CACHE_MAX_SIZE = 5000

// Cache for road heights to avoid recalculating
const roadHeightCache = new Map()
const CACHE_PRECISION = 1 // Round Z to this precision for caching

// ============================================================================
// Internal Helpers
// ============================================================================

// Create a shared noise instance for terrain sampling (same seed as TerrainManager)
const terrainNoiseSampler = new Noise(1234)

// Reusable Vector3 instances to avoid allocations in hot paths
const _roadPos = new Vector3()
const _tangent = new Vector3()

/**
 * Sample raw terrain height at a position (without road influence)
 */
const sampleTerrainHeight = (x, z) => {
	const noiseValue = terrainNoiseSampler.perlin2(x / TERRAIN_SMOOTHNESS, z / TERRAIN_SMOOTHNESS)
	const normalizedHeight = (noiseValue + 1) / 2
	return normalizedHeight * TERRAIN_MAX_HEIGHT
}

/**
 * Calculate road X position at given Z (lateral position only)
 * The curve naturally passes through x=0 at z=0 and gradually increases amplitude
 */
const getRoadXAtZ = (z) => {
	// Base curve using sine (naturally 0 at z=0)
	const baseCurve = Math.sin(z * CURVE_FREQ_X) * CURVE_AMP_X

	// Secondary variation (also using sine to be 0 at origin)
	const secondaryCurve = Math.sin(z * CURVE_OFFSET_X * 2.3) * (CURVE_AMP_X * 0.3)

	// Gradual amplitude envelope - starts at 0 and ramps up over distance
	const distFromOrigin = Math.abs(z)
	let amplitude
	if (distFromOrigin < SPAWN_FLAT_RADIUS) {
		amplitude = 0
	} else if (distFromOrigin < SPAWN_TRANSITION_END) {
		const t = (distFromOrigin - SPAWN_FLAT_RADIUS) / (SPAWN_TRANSITION_END - SPAWN_FLAT_RADIUS)
		// Use smootherstep for very gradual curve introduction
		amplitude = t * t * t * (t * (t * 6 - 15) + 10)
	} else {
		amplitude = 1
	}

	return (baseCurve + secondaryCurve) * amplitude
}

/**
 * Calculate smoothed road height by averaging terrain samples along the path
 */
const calculateSmoothedRoadHeight = (z) => {
	const cacheKey = Math.round(z / CACHE_PRECISION) * CACHE_PRECISION

	if (roadHeightCache.has(cacheKey)) {
		return roadHeightCache.get(cacheKey)
	}

	let totalHeight = 0
	let totalWeight = 0

	// Sample terrain at multiple points ahead and behind for smoothing
	for (let i = -ROAD_HEIGHT_SAMPLES; i <= ROAD_HEIGHT_SAMPLES; i++) {
		const sampleZ = z + (i / ROAD_HEIGHT_SAMPLES) * ROAD_HEIGHT_SAMPLE_DISTANCE
		const sampleX = getRoadXAtZ(sampleZ)

		// Gaussian-like weight - stronger falloff for distant samples
		const normalizedDist = i / ROAD_HEIGHT_SAMPLES
		const weight = Math.exp(-2 * normalizedDist * normalizedDist)

		totalHeight += sampleTerrainHeight(sampleX, sampleZ) * weight
		totalWeight += weight
	}

	// Apply damping to reduce height variation
	const avgTerrainHeight = totalHeight / totalWeight
	const smoothedHeight = avgTerrainHeight * ROAD_HEIGHT_DAMPING

	// Cache the result
	roadHeightCache.set(cacheKey, smoothedHeight)

	// Limit cache size
	if (roadHeightCache.size > 2000) {
		const firstKey = roadHeightCache.keys().next().value
		roadHeightCache.delete(firstKey)
	}

	return smoothedHeight
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Calculates the center position of the road at a given Z coordinate.
 * Pass optional target Vector3 to avoid allocation.
 */
export const getRoadPositionAtZ = (z, target = _roadPos) => {
	const distFromOrigin = Math.abs(z)

	// Lateral position (X)
	const x = getRoadXAtZ(z)

	// Elevation (Y) - follows averaged terrain height for smooth driving
	let y
	if (distFromOrigin < SPAWN_FLAT_RADIUS) {
		y = 0
	} else if (distFromOrigin < SPAWN_TRANSITION_END) {
		const t = (distFromOrigin - SPAWN_FLAT_RADIUS) / (SPAWN_TRANSITION_END - SPAWN_FLAT_RADIUS)
		const blend = t * t * t * (t * (t * 6 - 15) + 10)
		const terrainHeight = calculateSmoothedRoadHeight(z)
		y = terrainHeight * blend
	} else {
		y = calculateSmoothedRoadHeight(z)
	}

	return target.set(x, y, z)
}

/**
 * Calculates the tangent (direction) at Z.
 * Pass optional target Vector3 to avoid allocation.
 */
export const getRoadTangentAtZ = (z, target = _tangent) => {
	const delta = 1.0
	const p1 = getRoadPositionAtZ(z - delta, new Vector3())
	const p2 = getRoadPositionAtZ(z + delta, new Vector3())
	return target.set(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z).normalize()
}

/**
 * Check if a world position is on or near the road
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @returns {object} { isOnRoad, isInTransition, blendFactor, roadHeight, roadX, signedDistance, bankAngle }
 */
export const getRoadInfo = (worldX, worldZ) => {
	// Check cache first
	const cacheKeyX = Math.round(worldX / ROAD_INFO_CACHE_PRECISION) * ROAD_INFO_CACHE_PRECISION
	const cacheKeyZ = Math.round(worldZ / ROAD_INFO_CACHE_PRECISION) * ROAD_INFO_CACHE_PRECISION
	const cacheKey = `${cacheKeyX},${cacheKeyZ}`

	const cached = roadInfoCache.get(cacheKey)
	if (cached !== undefined) {
		return cached
	}

	// Use thread-local vectors to avoid allocation
	const roadPos = getRoadPositionAtZ(worldZ, _roadPos)
	const tangent = getRoadTangentAtZ(worldZ, _tangent)

	// Calculate bank angle based on road curvature
	const bankAngle = roadPos.x * 0.0015

	// Calculate Right vector (perpendicular to tangent and up)
	const worldUp = { x: 0, y: 1, z: 0 }
	// right = cross(worldUp, tangent)
	let rightX = worldUp.y * tangent.z - worldUp.z * tangent.y
	let rightY = worldUp.z * tangent.x - worldUp.x * tangent.z
	let rightZ = worldUp.x * tangent.y - worldUp.y * tangent.x
	const rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ)
	if (rightLen > 0.001) {
		rightX /= rightLen
		rightY /= rightLen
		rightZ /= rightLen
	}

	// Apply banking rotation to right vector (rotate around tangent by bankAngle)
	const cosBank = Math.cos(bankAngle)
	const sinBank = Math.sin(bankAngle)
	// Rodrigues' rotation formula simplified for rotation around tangent
	const dot = rightX * tangent.x + rightY * tangent.y + rightZ * tangent.z
	const crossX = tangent.y * rightZ - tangent.z * rightY
	const crossY = tangent.z * rightX - tangent.x * rightZ
	const crossZ = tangent.x * rightY - tangent.y * rightX
	const bankedRightX = rightX * cosBank + crossX * sinBank + tangent.x * dot * (1 - cosBank)
	const bankedRightY = rightY * cosBank + crossY * sinBank + tangent.y * dot * (1 - cosBank)
	const bankedRightZ = rightZ * cosBank + crossZ * sinBank + tangent.z * dot * (1 - cosBank)

	// Calculate signed distance along the banked right vector
	// Project the offset from road center onto the right vector
	const offsetX = worldX - roadPos.x
	const offsetZ = worldZ - roadPos.z // This is 0 since we sample at same Z
	const signedDistance = offsetX * bankedRightX + offsetZ * bankedRightZ
	const distance = Math.abs(signedDistance)

	// Calculate height offset due to banking
	const bankOffset = signedDistance * bankedRightY

	const roadHalfWidth = ROAD_WIDTH / 2
	const shoulderEnd = roadHalfWidth + ROAD_SHOULDER_WIDTH
	const transitionEnd = roadHalfWidth + ROAD_TRANSITION_WIDTH

	let blendFactor = 0 // 0 = full terrain, 1 = full road
	let isOnRoad = false
	let isInTransition = false

	if (distance < roadHalfWidth) {
		// On the road - full road height
		isOnRoad = true
		blendFactor = 1
	} else if (distance < shoulderEnd) {
		// On shoulder - keep road height (banked plane)
		isInTransition = true
		blendFactor = 1.0 // Shoulder follows road plane exactly
	} else if (distance < transitionEnd) {
		// In transition zone - smootherstep from shoulder to terrain
		isInTransition = true
		const t = (distance - shoulderEnd) / (transitionEnd - shoulderEnd)
		// Use smootherstep for very smooth transition
		const smoothT = t * t * t * (t * (t * 6 - 15) + 10)
		blendFactor = 1.0 - smoothT
	}

	const result = {
		isOnRoad,
		isInTransition,
		blendFactor,
		roadHeight: roadPos.y + bankOffset,
		roadX: roadPos.x,
		signedDistance,
		bankAngle,
	}

	// Cache the result
	roadInfoCache.set(cacheKey, result)

	// Limit cache size
	if (roadInfoCache.size > ROAD_INFO_CACHE_MAX_SIZE) {
		const firstKey = roadInfoCache.keys().next().value
		roadInfoCache.delete(firstKey)
	}

	return result
}
