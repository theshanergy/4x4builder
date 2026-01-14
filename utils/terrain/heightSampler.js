// Terrain Height Sampler
// Generates terrain with a central valley and mountains on the sides.
// Mountains appear in bands based on Z distance from origin.

import { Vector3 } from 'three'

import TERRAIN_CONFIG from '../../config/terrain'
import WATER_CONFIG from '../../config/water'
import { getRiverDepthFactor, getValleyFactor } from './rivers'

// Epsilon for numerical gradient approximation
const GRADIENT_EPSILON = 0.01

/**
 * Creates terrain helper functions for height and normal sampling.
 *
 * @param {Object} noise - Noise instance from noisejs
 * @returns {Object} Object with getHeight, getNormal, and isWater functions
 */
export const createTerrainHelpers = (noise) => {
	const { baseFrequency, baseAmplitude, maxMountainHeight, mountainScale, spawnRadius } = TERRAIN_CONFIG

	/**
	 * Smoothstep interpolation (cubic hermite)
	 */
	const smoothstep = (t) => {
		const c = Math.max(0, Math.min(1, t))
		return c * c * (3 - 2 * c)
	}

	/**
	 * Get terrain height at any world position.
	 *
	 * Layers:
	 * - Base terrain: Rolling hills from FBM noise
	 * - Mountains: Appear in bands based on Z distance, using ridge noise
	 * - River carving: Cuts channels through terrain
	 *
	 * @param {number} x - World X coordinate
	 * @param {number} z - World Z coordinate
	 * @returns {number} Height value in world units
	 */
	const getHeight = (x, z) => {
		const distSq = x * x + z * z
		const dist = Math.sqrt(distSq)

		// === BASE TERRAIN: Rolling hills ===
		const baseNoise =
			(noise.perlin2(x * baseFrequency, z * baseFrequency) * 0.6 +
				noise.perlin2(x * baseFrequency * 2.2, z * baseFrequency * 2.2) * 0.3 +
				noise.perlin2(x * baseFrequency * 4.5, z * baseFrequency * 4.5) * 0.1) *
			baseAmplitude

		// Regional height modulation - creates dispersed flatter areas
		const regionNoise = noise.perlin2(x * 0.0003 + 100, z * 0.0003 + 100)
		const regionModifier = 0.1 + (regionNoise + 1) * 0.45

		let height = baseNoise * regionModifier

		// === MOUNTAINS: Based on distance from nearest valley center ===
		// Use valley factor from rivers.js for proper separation of concerns
		const mountainBlend = getValleyFactor(x, z, noise)

		if (mountainBlend > 0) {
			// Ridge noise for sharp peaks
			const ridge1 = 1 - Math.abs(noise.perlin2(x * mountainScale, z * mountainScale))
			const ridge2 = 1 - Math.abs(noise.perlin2(x * mountainScale * 1.8 + 100, z * mountainScale * 1.8 + 100))
			const ridgeNoise = ridge1 * ridge1 * 0.6 + ridge2 * ridge2 * 0.4

			// Mountain mask - controls where mountains appear within the band
			const mountainMask = noise.perlin2(x * mountainScale * 0.3 + 500, z * mountainScale * 0.3 + 500)
			const mountainFactor = smoothstep((mountainMask + 0.3) / 0.8)

			const mountainHeight = ridgeNoise * mountainFactor * mountainBlend * maxMountainHeight
			height += mountainHeight
		}

		// === SPAWN AREA: Flat center with smooth blend to surrounding terrain ===
		if (dist < spawnRadius) {
			// S-curve blend: flat at center, smooth ascent, blends seamlessly at edge
			// Using smoothstep creates smooth acceleration and deceleration
			const t = dist / spawnRadius
			const blend = smoothstep(t)
			height *= blend
		}

		// === RIVER CARVING: Cut channels through terrain ===
		const riverDepthFactor = getRiverDepthFactor(x, z, noise)
		if (riverDepthFactor > 0) {
			const riverDepth = 2.5
			const varianceRetention = 1 - riverDepthFactor * 0.95
			const carvedHeight = height * varianceRetention - riverDepthFactor * riverDepth
			const riverBedFloor = WATER_CONFIG.level - riverDepth * 1.1
			height = Math.max(carvedHeight, riverBedFloor)
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
