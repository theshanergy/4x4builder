// River Centerline Spline System
// Single source of truth for river path, geometry, and properties
// All other systems (terrain, water shader, buoyancy) derive from this
//
// USAGE EXAMPLES:
//
// // Get the singleton instance (same seed as terrain - 1234)
// const riverSpline = getRiverSpline()
//
// // Get river center position at any X coordinate
// const centerZ = riverSpline.getRiverZ(worldX)
//
// // Get all river properties at a location
// const { z, width, depth, flowSpeed, direction } = riverSpline.getRiverDataAt(worldX)
//
// // Get distance from a world position to the river
// const { distance, riverData } = riverSpline.getDistanceToRiver(worldX, worldZ)
//
// // Access individual properties
// const width = riverSpline.getRiverWidth(worldX)
// const depth = riverSpline.getRiverDepth(worldX)
// const speed = riverSpline.getFlowSpeed(worldX)
// const direction = riverSpline.getFlowDirection(worldX) // { x, z } normalized
//
// NOTE: All data is deterministic based on seed (1234). Control points are generated
// once and cached. The spline uses Catmull-Rom interpolation for smooth curves.

import { Noise } from 'noisejs'
import { RIVER_CONFIG } from '../../../../config/water'

/**
 * Seeded random number generator (Simple LCG)
 * @param {number} seed - Random seed
 * @returns {Function} Random function that returns 0-1
 */
const createSeededRandom = (seed) => {
	let state = seed
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296
		return state / 4294967296
	}
}

/**
 * RiverSpline class - generates and interpolates river centerline with properties
 */
export class RiverSpline {
	/**
	 * @param {number} seed - Random seed (same as terrain noise)
	 * @param {number} startX - Start X coordinate (typically -ocean boundary)
	 * @param {number} endX - End X coordinate (typically +ocean boundary)
	 * @param {number} controlPointSpacing - Distance between control points
	 */
	constructor(seed = 1234, startX = -5300, endX = 5300, controlPointSpacing = 300) {
		this.seed = seed
		this.startX = startX
		this.endX = endX
		this.controlPointSpacing = controlPointSpacing

		// Initialize seeded random and noise
		this.random = createSeededRandom(seed)
		this.noise = new Noise(seed)
		this.noise.seed(seed)

		// Generate control points
		this.controlPoints = this.generateControlPoints()
	}

	/**
	 * Generate river control points from one ocean edge to the other
	 * Each point contains: x, z (position), width, depth, flowSpeed
	 */
	generateControlPoints() {
		const points = []
		const totalDistance = this.endX - this.startX
		const numPoints = Math.ceil(totalDistance / this.controlPointSpacing) + 1

		// Start at baseZ with some initial offset
		let currentZ = RIVER_CONFIG.baseZ
		let lastAngle = 0 // Track direction for smooth curves

		// Spawn point avoidance parameters
		const spawnX = 0
		const spawnZ = 0
		const avoidanceRadius = 400 // Distance to push river away from spawn
		const avoidanceStrength = 250 // How far to push the river

		for (let i = 0; i < numPoints; i++) {
			const t = i / (numPoints - 1) // 0 to 1
			const x = this.startX + t * totalDistance

			// Distance from center (for ocean transitions)
			const distFromCenter = Math.abs(x)
			const oceanStart = 4500
			const oceanTransition = 800

			// Ocean transition factor (1 = interior, 0 = deep ocean)
			let interiorFactor = 1
			if (distFromCenter > oceanStart) {
				const oceanT = Math.min(1, (distFromCenter - oceanStart) / oceanTransition)
				interiorFactor = 1 - oceanT * oceanT * (3 - 2 * oceanT) // smoothstep
			}

			// Calculate spawn point avoidance
			const distToSpawnX = Math.abs(x - spawnX)
			let spawnAvoidanceOffset = 0
			if (distToSpawnX < avoidanceRadius) {
				// Smooth falloff using smoothstep
				const falloff = 1 - (distToSpawnX / avoidanceRadius)
				const smoothFalloff = falloff * falloff * (3 - 2 * falloff)
				// Push river to positive Z side of spawn
				spawnAvoidanceOffset = smoothFalloff * avoidanceStrength
			}

			// Generate meandering Z offset using multiple frequencies
			if (i > 0 && i < numPoints - 1) {
				// Use noise for natural variation (multiple octaves for detail)
				const noiseScale1 = 0.002
				const noiseScale2 = 0.008
				const noiseScale3 = 0.02

				const noise1 = this.noise.perlin2(x * noiseScale1, 100) * 200 * interiorFactor
				const noise2 = this.noise.perlin2(x * noiseScale2, 200) * 60 * interiorFactor
				const noise3 = this.noise.perlin2(x * noiseScale3, 300) * 20 * interiorFactor

				// Calculate desired angle change (meander tendency)
				const angleNoise = this.noise.perlin2(x * 0.001, 400)
				const targetAngle = angleNoise * 0.3 * interiorFactor // Max ±0.3 radians

				// Smooth angle changes for natural curves
				lastAngle = lastAngle * 0.7 + targetAngle * 0.3
				const zOffset = noise1 + noise2 + noise3

				currentZ = RIVER_CONFIG.baseZ + zOffset + spawnAvoidanceOffset
			} else {
				// Apply spawn avoidance to start/end points too
				currentZ = RIVER_CONFIG.baseZ + spawnAvoidanceOffset
			}

			// Width varies along river (wider in some sections, narrower in others)
			const widthNoise = this.noise.perlin2(x * 0.003, 500)
			const widthVariation = (widthNoise * 0.5 + 0.5) * 40 // 0-40 units variation
			const width = (RIVER_CONFIG.width + widthVariation) * interiorFactor * 0.7 + RIVER_CONFIG.width * 0.3

			// Depth varies (deeper in center, shallower near edges and curves)
			const depthNoise = this.noise.perlin2(x * 0.004, 600)
			const depthVariation = (depthNoise * 0.5 + 0.5) * 1.2 // 0-1.2 depth variation
			const depth = (RIVER_CONFIG.depth + depthVariation) * interiorFactor * 0.7 + RIVER_CONFIG.depth * 0.3

			// Flow speed (faster in straighter sections, slower in curves)
			const curvature = Math.abs(lastAngle)
			const baseFlowSpeed = 1.0
			const curveSpeedReduction = curvature * 0.4 // Slow down 40% in tight curves
			const flowSpeed = (baseFlowSpeed - curveSpeedReduction) * interiorFactor * 0.8 + 0.2

			points.push({
				x,
				z: currentZ,
				width,
				depth,
				flowSpeed,
				angle: lastAngle, // Store for tangent calculations
			})
		}

		return points
	}

	/**
	 * Find the control point segment for a given X coordinate
	 * @param {number} x - World X coordinate
	 * @returns {Object} { index, t } - segment index and local t (0-1)
	 */
	findSegment(x) {
		// Clamp to river bounds
		const clampedX = Math.max(this.startX, Math.min(this.endX, x))

		// Binary search for the right segment
		let left = 0
		let right = this.controlPoints.length - 1

		while (left < right - 1) {
			const mid = Math.floor((left + right) / 2)
			if (this.controlPoints[mid].x < clampedX) {
				left = mid
			} else {
				right = mid
			}
		}

		// Calculate local t within segment
		const p0 = this.controlPoints[left]
		const p1 = this.controlPoints[right]
		const segmentLength = p1.x - p0.x
		const t = segmentLength > 0 ? (clampedX - p0.x) / segmentLength : 0

		return { index: left, t }
	}

	/**
	 * Catmull-Rom spline interpolation for smooth curves
	 * @param {number} t - Parameter (0-1) within segment
	 * @param {number} p0, p1, p2, p3 - Four control point values
	 * @returns {number} Interpolated value
	 */
	catmullRom(t, p0, p1, p2, p3) {
		const t2 = t * t
		const t3 = t2 * t

		return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
	}

	/**
	 * Get interpolated river Z position at given X
	 * @param {number} x - World X coordinate
	 * @returns {number} River center Z position
	 */
	getRiverZ(x) {
		const { index, t } = this.findSegment(x)
		const points = this.controlPoints

		// Get 4 points for Catmull-Rom (with boundary handling)
		const i0 = Math.max(0, index - 1)
		const i1 = index
		const i2 = Math.min(points.length - 1, index + 1)
		const i3 = Math.min(points.length - 1, index + 2)

		return this.catmullRom(t, points[i0].z, points[i1].z, points[i2].z, points[i3].z)
	}

	/**
	 * Get interpolated river width at given X
	 * @param {number} x - World X coordinate
	 * @returns {number} River width
	 */
	getRiverWidth(x) {
		const { index, t } = this.findSegment(x)
		const points = this.controlPoints

		const i0 = Math.max(0, index - 1)
		const i1 = index
		const i2 = Math.min(points.length - 1, index + 1)
		const i3 = Math.min(points.length - 1, index + 2)

		return this.catmullRom(t, points[i0].width, points[i1].width, points[i2].width, points[i3].width)
	}

	/**
	 * Get interpolated river depth at given X
	 * @param {number} x - World X coordinate
	 * @returns {number} River depth below water level
	 */
	getRiverDepth(x) {
		const { index, t } = this.findSegment(x)
		const points = this.controlPoints

		const i0 = Math.max(0, index - 1)
		const i1 = index
		const i2 = Math.min(points.length - 1, index + 1)
		const i3 = Math.min(points.length - 1, index + 2)

		return this.catmullRom(t, points[i0].depth, points[i1].depth, points[i2].depth, points[i3].depth)
	}

	/**
	 * Get interpolated flow speed at given X
	 * @param {number} x - World X coordinate
	 * @returns {number} Flow speed (0-1+)
	 */
	getFlowSpeed(x) {
		const { index, t } = this.findSegment(x)
		const points = this.controlPoints

		const i0 = Math.max(0, index - 1)
		const i1 = index
		const i2 = Math.min(points.length - 1, index + 1)
		const i3 = Math.min(points.length - 1, index + 2)

		return this.catmullRom(t, points[i0].flowSpeed, points[i1].flowSpeed, points[i2].flowSpeed, points[i3].flowSpeed)
	}

	/**
	 * Get flow direction (tangent to spline) at given X
	 * Returns normalized direction vector
	 * @param {number} x - World X coordinate
	 * @returns {Object} { x: dx, z: dz } normalized direction
	 */
	getFlowDirection(x) {
		// Sample two nearby points on the spline to calculate tangent
		const delta = 10 // Small step for numerical derivative
		const z1 = this.getRiverZ(x - delta)
		const z2 = this.getRiverZ(x + delta)

		// Direction vector (always flows in +X direction)
		let dx = 1
		let dz = (z2 - z1) / (2 * delta)

		// Normalize
		const length = Math.sqrt(dx * dx + dz * dz)
		dx /= length
		dz /= length

		return { x: dx, z: dz }
	}

	/**
	 * Get complete river data at a given X coordinate
	 * @param {number} x - World X coordinate
	 * @returns {Object} { z, width, depth, flowSpeed, direction }
	 */
	getRiverDataAt(x) {
		return {
			z: this.getRiverZ(x),
			width: this.getRiverWidth(x),
			depth: this.getRiverDepth(x),
			flowSpeed: this.getFlowSpeed(x),
			direction: this.getFlowDirection(x),
		}
	}

	/**
	 * Get distance from a world position to the river centerline
	 * @param {number} worldX - World X coordinate
	 * @param {number} worldZ - World Z coordinate
	 * @returns {Object} { distance, riverData, signedDistance }
	 */
	getDistanceToRiver(worldX, worldZ) {
		const riverData = this.getRiverDataAt(worldX)
		const signedDistance = worldZ - riverData.z
		const distance = Math.abs(signedDistance)

		return {
			distance,
			signedDistance,
			riverData,
		}
	}
}

// Singleton instance - same seed as terrain
let cachedRiverSpline = null

/**
 * Get the cached river spline instance (creates on first call)
 * Uses same seed as terrain (1234)
 * @returns {RiverSpline}
 */
export const getRiverSpline = () => {
	if (!cachedRiverSpline) {
		const { startX, endX } = RIVER_CONFIG
		cachedRiverSpline = new RiverSpline(1234, startX, endX, 300)
	}
	return cachedRiverSpline
}

/**
 * Reset the cached spline (useful for hot reload or seed changes)
 */
export const resetRiverSpline = () => {
	cachedRiverSpline = null
}
