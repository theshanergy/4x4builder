import { Vector3 } from 'three'

// ============================================================================
// Road Configuration
// ============================================================================

// Road curve parameters - controls the procedural generation
const CURVE_AMP_X = 60 // Lateral curve amplitude
const CURVE_FREQ_X = 0.002 // Lateral curve frequency
const CURVE_OFFSET_X = 0.0005 // Secondary lateral variation

// Spawn area parameters - road starts straight and flat at origin
const SPAWN_FLAT_RADIUS = 50 // Road is straight and flat within this distance from origin
const SPAWN_TRANSITION_END = 150 // Road fully follows curves/terrain beyond this distance

// Road dimensions - matching reference road profile
export const ROAD_WIDTH = 14 // Total road width (7m half-width)
export const ROAD_SHOULDER_WIDTH = 3 // Shoulder extends 3m beyond road edge
export const ROAD_TRANSITION_WIDTH = 22 // Transition from shoulder to full terrain

// ============================================================================
// Caching
// ============================================================================

// Cache for getRoadInfo results (key: "x,z" rounded to precision)
const roadInfoCache = new Map()
const ROAD_INFO_CACHE_PRECISION = 0.5 // Cache precision in world units
const ROAD_INFO_CACHE_MAX_SIZE = 5000

// ============================================================================
// Internal Helpers
// ============================================================================

// Reusable Vector3 instances to avoid allocations in hot paths
const _roadPos = new Vector3()
const _tangent = new Vector3()

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

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Calculates the center position of the road at a given Z coordinate.
 * Pass optional target Vector3 to avoid allocation.
 */
export const getRoadPositionAtZ = (z, target = _roadPos) => {
	// Road always stays at y=0, only curves laterally (X)
	return target.set(getRoadXAtZ(z), 0, z)
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
