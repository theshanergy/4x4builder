// River flow map texture generation and caching
// Generates a texture encoding river flow direction, speed, and river mask
// Uses RiverSpline as single source of truth for all river properties

import { DataTexture, RGBAFormat, LinearFilter, ClampToEdgeWrapping } from 'three'
import { RIVER_CONFIG } from '../../../../config/water'
import { getRiverSpline } from './spline'

/**
 * Generate a flow map texture for the water shader.
 *
 * Texture encoding (RGBA):
 * - R channel: Flow X direction (0.5 = no flow, 0 or 1 = max flow in that axis)
 * - G channel: Flow Z direction (same as R)
 * - B channel: Flow speed (0 = ocean/still, 1 = fast river)
 * - A channel: River mask (0 = ocean, 1 = river)
 *
 * @param {number} resolution - Texture resolution (power of 2 recommended)
 * @param {number} worldSize - Size of world area to cover (centered on origin)
 * @returns {DataTexture} - Flow map texture
 */
export const generateFlowMap = (resolution = 512, worldSize = 4000) => {
	const data = new Uint8Array(resolution * resolution * 4)
	const halfSize = worldSize / 2

	// Get the river spline (single source of truth)
	const riverSpline = getRiverSpline()

	// River influence extends beyond the visible water for smooth blending
	const blendDistance = RIVER_CONFIG.transition * 3

	// Ocean transition configuration (imported from config)
	const oceanTransitionStart = 4500 // Start transitioning to ocean flow
	const oceanTransitionDistance = 800 // Distance over which to blend to ocean

	for (let y = 0; y < resolution; y++) {
		for (let x = 0; x < resolution; x++) {
			const idx = (y * resolution + x) * 4

			// Convert pixel coords to world coords
			const worldX = (x / resolution) * worldSize - halfSize
			const worldZ = (y / resolution) * worldSize - halfSize

			// Get river geometry at this X position from spline
			const riverData = riverSpline.getRiverDataAt(worldX)
			const riverZ = riverData.z
			const riverWidth = riverData.width
			const halfWidth = riverWidth / 2

			// Distance from river center
			const distFromRiver = Math.abs(worldZ - riverZ)

			// Calculate base river influence (1 at center, fading to 0 at edges)
			let riverInfluence = 0
			if (distFromRiver < halfWidth) {
				// Inside river - full influence
				riverInfluence = 1
			} else if (distFromRiver < halfWidth + blendDistance) {
				// In blend zone - smooth falloff
				const t = (distFromRiver - halfWidth) / blendDistance
				riverInfluence = 1 - t * t * (3 - 2 * t) // smoothstep
			}

			// Apply distance-based ocean transition
			// As we approach the ocean, gradually reduce river flow
			const distFromOrigin = Math.abs(worldX)
			if (distFromOrigin > oceanTransitionStart) {
				const oceanBlendT = Math.min(1, (distFromOrigin - oceanTransitionStart) / oceanTransitionDistance)
				// Use smooth cubic easing for natural transition
				const oceanFade = 1 - oceanBlendT * oceanBlendT * (3 - 2 * oceanBlendT)
				riverInfluence *= oceanFade
			}

			// Get flow direction from spline (tangent to river path)
			const direction = riverData.direction
			let flowX = direction.x
			let flowZ = direction.z

			// Flow speed varies - use spline's base speed, modified by position
			// Faster in center, slower at edges
			const centerFactor = distFromRiver < halfWidth ? 1 - (distFromRiver / halfWidth) * 0.3 : 0.7
			const flowSpeed = riverInfluence * centerFactor * riverData.flowSpeed

			// Encode to texture:
			// R = flow X direction (0.5 = none, 0 = -1, 1 = +1)
			// G = flow Z direction (0.5 = none, 0 = -1, 1 = +1)
			// B = flow speed (0 = still, 1 = fast)
			// A = river mask (0 = ocean, 1 = river)
			const encodedFlowX = Math.floor(((flowX * riverInfluence) * 0.5 + 0.5) * 255)
			const encodedFlowZ = Math.floor(((flowZ * riverInfluence) * 0.5 + 0.5) * 255)
			const encodedSpeed = Math.floor(flowSpeed * 255)
			const encodedMask = Math.floor(riverInfluence * 255)

			data[idx + 0] = encodedFlowX
			data[idx + 1] = encodedFlowZ
			data[idx + 2] = Math.min(255, encodedSpeed)
			data[idx + 3] = encodedMask
		}
	}

	const texture = new DataTexture(data, resolution, resolution, RGBAFormat)
	texture.minFilter = LinearFilter
	texture.magFilter = LinearFilter
	texture.wrapS = ClampToEdgeWrapping
	texture.wrapT = ClampToEdgeWrapping
	texture.needsUpdate = true

	return texture
}

/**
 * Cached flow map singleton - generates once and reuses
 */
let cachedFlowMap = null

/**
 * Get the cached flow map texture (generates on first call)
 * @returns {DataTexture} - Flow map texture
 */
export const getFlowMap = () => {
	if (!cachedFlowMap) {
		const { resolution, worldSize } = RIVER_CONFIG.flowMap
		cachedFlowMap = generateFlowMap(resolution, worldSize)
	}
	return cachedFlowMap
}

/**
 * Get the cached flow map data for CPU-side sampling
 * @returns {Object} - { data, resolution, worldSize }
 */
export const getFlowMapData = () => {
	const flowMap = getFlowMap()
	const { resolution, worldSize } = RIVER_CONFIG.flowMap
	return {
		data: flowMap.image.data,
		resolution,
		worldSize,
	}
}
