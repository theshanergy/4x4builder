// River/Valley Utilities
// Functions for infinite valleys with noise-based spacing and river carving.

import RIVER_CONFIG from '../../config/rivers.js'

const {
	valleySpacing,
	valleySpacingVariation,
	mountainTransitionWidth,
	primaryFrequency,
	primaryAmplitude,
	secondaryFrequency,
	secondaryAmplitude,
	tertiaryAmplitude,
	width,
	widthVariation,
	bankSlope,
} = RIVER_CONFIG

/**
 * Get the base Z position for a valley at a given index.
 * Uses noise to vary the spacing between valleys for natural appearance.
 */
const getValleyBaseZ = (valleyIndex, noise) => {
	// Base position from regular spacing
	const baseZ = valleyIndex * valleySpacing

	// Add noise-based offset for irregular spacing
	if (noise && valleySpacingVariation > 0) {
		// Use valley index as seed for consistent offset per valley
		const offset = noise.perlin2(valleyIndex * 0.7 + 500, 0.3) * valleySpacing * valleySpacingVariation
		return baseZ + offset
	}

	return baseZ
}

/**
 * Find the nearest valley index for a given Z position.
 * Checks neighboring valleys to find the actual closest one.
 */
const getNearestValleyIndex = (z, noise) => {
	// Start with estimated index based on regular spacing
	const estimatedIndex = Math.round(z / valleySpacing)

	// Check this and neighboring valleys to find closest
	let nearestIndex = estimatedIndex
	let nearestDistance = Infinity

	for (let i = estimatedIndex - 2; i <= estimatedIndex + 2; i++) {
		const valleyZ = getValleyBaseZ(i, noise)
		const dist = Math.abs(z - valleyZ)
		if (dist < nearestDistance) {
			nearestDistance = dist
			nearestIndex = i
		}
	}

	return nearestIndex
}

/**
 * Calculate the meander offset at a given X position for a specific valley.
 * This is the deviation from the valley's base Z position.
 */
const getMeanderOffset = (x, valleyIndex, noise) => {
	const primary = Math.sin(x * primaryFrequency) * primaryAmplitude
	const secondary = Math.sin(x * secondaryFrequency + 1.5) * secondaryAmplitude
	const tertiary = noise ? noise.perlin2(x * 0.003 + valleyIndex * 100, 0.5) * tertiaryAmplitude : 0
	return primary + secondary + tertiary
}

/**
 * Get info about the nearest valley to a world position.
 * Returns the valley's river center Z and distance to it.
 * This is the central function for all river calculations - call this once
 * and reuse the result to avoid redundant meander calculations.
 */
export const getNearestValley = (worldX, worldZ, noise) => {
	const valleyIndex = getNearestValleyIndex(worldZ, noise)
	const valleyBaseZ = getValleyBaseZ(valleyIndex, noise)
	const meanderOffset = getMeanderOffset(worldX, valleyIndex, noise)
	const riverCenterZ = valleyBaseZ + meanderOffset

	return {
		valleyIndex,
		valleyBaseZ,
		riverCenterZ,
		distanceToValley: Math.abs(worldZ - riverCenterZ),
	}
}

/**
 * Calculate river width at a given position.
 * Width varies using noise for natural appearance.
 */
export const getRiverWidth = (x, noise, valleyIndex = 0) => {
	const variation = noise ? noise.perlin2(x * 0.005 + 100 + valleyIndex * 50, 0.5) * widthVariation : 0
	return width + variation
}

/**
 * Calculate how deeply the river should carve into terrain at a given position.
 * Returns 0-1 where 0 = no carving, 1 = maximum depth at river center.
 * Optionally accepts pre-computed valley info to avoid redundant calculations.
 */
export const getRiverDepthFactor = (worldX, worldZ, noise, valley = null) => {
	const v = valley || getNearestValley(worldX, worldZ, noise)
	const riverWidth = getRiverWidth(worldX, noise, v.valleyIndex)
	const halfWidth = riverWidth / 2
	const distance = v.distanceToValley

	if (distance < halfWidth) {
		// River bed: full depth across the water width
		return 1
	} else if (distance < halfWidth + bankSlope) {
		// Banks: slope from full depth up to surface (0) outside river width
		const bankProgress = (distance - halfWidth) / bankSlope
		const t = bankProgress * bankProgress * (3 - 2 * bankProgress)
		return 1 - t
	}

	return 0
}

/**
 * Calculate mountain blend factor based on distance from valley center.
 * Returns 0 in the valley (near river), 1 in full mountain zones.
 * Mountains start at approximately valleySpacing/2 from river center.
 * Optionally accepts pre-computed valley info to avoid redundant calculations.
 *
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} noise - Noise instance
 * @param {Object} valley - Optional pre-computed valley info from getNearestValley
 * @returns {number} Mountain blend factor (0-1)
 */
export const getValleyFactor = (worldX, worldZ, noise, valley = null) => {
	const v = valley || getNearestValley(worldX, worldZ, noise)
	const distanceToValley = v.distanceToValley

	// Mountains start halfway between valleys (valleySpacing/2)
	// Subtract transition width to begin the blend before full mountain zone
	const mountainStartDistance = valleySpacing / 2 - mountainTransitionWidth

	if (distanceToValley <= mountainStartDistance) {
		// Inside valley - no mountains
		return 0
	}

	const mountainFullDistance = mountainStartDistance + mountainTransitionWidth

	if (distanceToValley >= mountainFullDistance) {
		// Full mountain zone
		return 1
	}

	// Transition zone - smooth blend using smoothstep
	const t = (distanceToValley - mountainStartDistance) / mountainTransitionWidth
	return t * t * (3 - 2 * t) // smoothstep
}

/**
 * Calculate the flow direction of the river at a given position.
 * Flow direction is tangent to the river's meandering curve.
 * Uses numerical derivative of the meander function.
 * @param {number} worldX - World X coordinate
 * @param {number} valleyIndex - Valley index for consistent calculations
 * @param {Object} noise - Noise instance
 * @returns {Object} Normalized flow direction vector {x, z}
 */
const getRiverFlowDirection = (worldX, valleyIndex, noise) => {
	// Calculate tangent direction using numerical derivative of meander
	const epsilon = 0.1
	const z1 = getMeanderOffset(worldX - epsilon, valleyIndex, noise)
	const z2 = getMeanderOffset(worldX + epsilon, valleyIndex, noise)

	// Tangent vector in world space
	const dx = epsilon * 2
	const dz = z2 - z1

	// Normalize
	const length = Math.sqrt(dx * dx + dz * dz)
	return {
		x: dx / length,
		z: dz / length,
	}
}

/**
 * Calculate river flow velocity at a given position.
 * Flow velocity increases where river narrows (conservation of mass).
 * Returns velocity magnitude and direction.
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @param {Object} noise - Noise instance
 * @returns {Object} {velocity: number, direction: {x, z}, strength: number}
 */
export const getRiverFlow = (worldX, worldZ, noise) => {
	// Get valley info once and reuse for all calculations
	const valley = getNearestValley(worldX, worldZ, noise)
	const riverWidth = getRiverWidth(worldX, noise, valley.valleyIndex)
	const halfWidth = riverWidth / 2
	const distance = valley.distanceToValley

	// Only calculate flow if we're in the river
	if (distance > halfWidth) {
		return { velocity: 0, direction: { x: 1, z: 0 }, strength: 0 }
	}

	// Get flow direction (tangent to river path) - uses same valley index
	const direction = getRiverFlowDirection(worldX, valley.valleyIndex, noise)

	// Calculate velocity based on river width (narrower = faster)
	// Using continuity equation: A1*V1 = A2*V2
	const averageWidth = width
	const widthRatio = averageWidth / riverWidth
	// Velocity scales with width ratio, clamped for realism
	const velocityMultiplier = Math.min(widthRatio * widthRatio, 3.0)
	const velocity = RIVER_CONFIG.baseFlowSpeed * velocityMultiplier

	// Flow strength is mostly uniform across river width
	// Only fades out near the very edges (last 20% of width)
	const edgeFadeStart = 0.8
	const normalizedDist = distance / halfWidth

	let flowProfile
	if (normalizedDist < edgeFadeStart) {
		flowProfile = 1.0
	} else {
		const edgeProgress = (normalizedDist - edgeFadeStart) / (1.0 - edgeFadeStart)
		flowProfile = 1.0 - edgeProgress * edgeProgress
	}

	return {
		velocity,
		direction,
		strength: flowProfile,
	}
}
