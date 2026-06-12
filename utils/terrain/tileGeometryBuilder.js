// Pure terrain tile builder — produces raw typed arrays for a quadtree tile.
// No three.js objects are created here, so this module can run on the main
// thread, in a benchmark, or inside a Web Worker (all outputs are
// transferable). The React hook wraps these arrays into BufferGeometry.

import { TILE_RESOLUTION } from '../../config/lod'
import TERRAIN_CONFIG from '../../config/terrain'
import WATER_CONFIG from '../../config/water'
import { terrainUsesRoadAttributes, terrainUsesClimateAttributes } from './materialFeatures'
import { writeSurfaceWeights } from './splineCorridors'

export const SAMPLE_COUNT = TILE_RESOLUTION + 1
export const TOTAL_SAMPLES = SAMPLE_COUNT * SAMPLE_COUNT
const NUM_TRIANGLES = TILE_RESOLUTION * TILE_RESOLUTION * 2
export const TERRAIN_INDEX_COUNT = NUM_TRIANGLES * 3

export const TERRAIN_INDICES = (() => {
	const indices = new Uint16Array(TERRAIN_INDEX_COUNT)
	let idx = 0

	for (let j = 0; j < TILE_RESOLUTION; j++) {
		const rowOffset = SAMPLE_COUNT * j
		for (let i = 0; i < TILE_RESOLUTION; i++) {
			const a = i + rowOffset
			const b = a + 1
			const c = a + SAMPLE_COUNT
			const d = c + 1

			indices[idx++] = a
			indices[idx++] = c
			indices[idx++] = b
			indices[idx++] = b
			indices[idx++] = c
			indices[idx++] = d
		}
	}

	return indices
})()

export const WATER_NORMALS = (() => {
	const normals = new Float32Array(TOTAL_SAMPLES * 3)
	for (let i = 0; i < TOTAL_SAMPLES; i++) {
		normals[i * 3 + 1] = 1
	}
	return normals
})()

export const WATER_FLOW_DIRS = new Float32Array(TOTAL_SAMPLES * 2)

export const USE_ROAD_ATTRIBUTES = terrainUsesRoadAttributes(TERRAIN_CONFIG.layers)
export const USE_CLIMATE_ATTRIBUTES = terrainUsesClimateAttributes(TERRAIN_CONFIG.layers)

/**
 * Build all vertex data for a quadtree terrain tile.
 * Handles edge stitching to prevent cracks between LOD levels and generates
 * water vertex data if the tile dips below water level.
 *
 * @param {Object} node - Quadtree node with size, centerX, centerZ
 * @param {Object} terrainHelpers - Object with getHeight / sample
 * @param {Object} edgeStitchInfo - Edge stitching configuration per direction
 * @returns {Object} Raw arrays:
 *   { positions, normals, uvs, roadWeights, roadParams, climateAttr, heightCache,
 *     water: null | { positions, depths, indices } }
 *   water.indices is null when the tile is fully underwater (use the shared
 *   full-tile index buffer).
 */
export const buildTileArrays = (node, terrainHelpers, edgeStitchInfo) => {
	const { size, centerX, centerZ } = node
	const segments = TILE_RESOLUTION
	const sampleCount = SAMPLE_COUNT
	const totalSamples = TOTAL_SAMPLES
	const step = size / segments
	const halfSize = size / 2
	const originX = centerX - halfSize
	const originZ = centerZ - halfSize

	const positions = new Float32Array(totalSamples * 3)
	const normals = new Float32Array(totalSamples * 3)
	const uvs = new Float32Array(totalSamples * 2)
	const roadWeights = USE_ROAD_ATTRIBUTES ? new Float32Array(totalSamples * 4) : null
	const roadParams = USE_ROAD_ATTRIBUTES ? new Float32Array(totalSamples * 4) : null
	const climateAttr = USE_CLIMATE_ATTRIBUTES ? new Float32Array(totalSamples * 4) : null

	// Track water depth only for tiles that need water geometry.
	let depths = null
	let hasWater = false
	let allWater = true

	// Cache for height samples - avoids recomputing for normal calculation
	// Layout matches Rapier HeightfieldCollider: x-major / z-inner.
	// heightCache[i * sampleCount + j] = world height at grid position (i, j)
	const heightCache = new Float32Array(totalSamples)

	// Pre-check edge stitch conditions to avoid repeated property access
	const westNeedsStitch = edgeStitchInfo.west.needsStitch
	const eastNeedsStitch = edgeStitchInfo.east.needsStitch
	const southNeedsStitch = edgeStitchInfo.south.needsStitch
	const northNeedsStitch = edgeStitchInfo.north.needsStitch
	const westStep = edgeStitchInfo.west.neighborStep
	const eastStep = edgeStitchInfo.east.neighborStep
	const southStep = edgeStitchInfo.south.neighborStep
	const northStep = edgeStitchInfo.north.neighborStep

	/**
	 * Get interpolated height for stitched edges.
	 * Snaps height samples to the coarser neighbor's grid.
	 */
	const getStitchedHeight = (worldX, worldZ, neighborStep, axis) => {
		// Sample at the coarse neighbor's step so the interpolated edge heights
		// match the neighbor's (band-limited) rendered vertices exactly.
		if (axis === 'x') {
			const gridX = worldX / neighborStep
			const x0 = Math.floor(gridX) * neighborStep
			const x1 = x0 + neighborStep
			const t = (worldX - x0) / neighborStep

			const h0 = terrainHelpers.getHeight(x0, worldZ, neighborStep)
			const h1 = terrainHelpers.getHeight(x1, worldZ, neighborStep)
			return h0 * (1 - t) + h1 * t
		} else {
			const gridZ = worldZ / neighborStep
			const z0 = Math.floor(gridZ) * neighborStep
			const z1 = z0 + neighborStep
			const t = (worldZ - z0) / neighborStep

			const h0 = terrainHelpers.getHeight(worldX, z0, neighborStep)
			const h1 = terrainHelpers.getHeight(worldX, z1, neighborStep)
			return h0 * (1 - t) + h1 * t
		}
	}

	// First pass: sample heights and cache them
	let vertIndex = 0
	for (let j = 0; j < sampleCount; j++) {
		const localZ = j * step
		const worldZ = originZ + localZ

		for (let i = 0; i < sampleCount; i++) {
			const localX = i * step
			const worldX = originX + localX

			let height
			let sampleInfo
			let uvWorldX = worldX
			let uvWorldZ = worldZ

			let stitchStep = 0
			let stitchAxis = null
			if (i === 0 && westNeedsStitch) {
				stitchStep = westStep
				stitchAxis = 'z'
			} else if (i === segments && eastNeedsStitch) {
				stitchStep = eastStep
				stitchAxis = 'z'
			} else if (j === 0 && southNeedsStitch) {
				stitchStep = southStep
				stitchAxis = 'x'
			} else if (j === segments && northNeedsStitch) {
				stitchStep = northStep
				stitchAxis = 'x'
			}

			if (stitchAxis) {
				height = getStitchedHeight(worldX, worldZ, stitchStep, stitchAxis)
				if (USE_ROAD_ATTRIBUTES || USE_CLIMATE_ATTRIBUTES) {
					sampleInfo = terrainHelpers.sample?.(worldX, worldZ, step)
				}

				// Snap UVs to coarse neighbor's grid points
				// Water shader uses UVs for wave calculations
				if (stitchAxis === 'z') {
					uvWorldZ = Math.round(worldZ / stitchStep) * stitchStep
				} else {
					uvWorldX = Math.round(worldX / stitchStep) * stitchStep
				}
			} else {
				// No stitching needed - sample directly at this tile's band
				sampleInfo = terrainHelpers.sample?.(worldX, worldZ, step)
				height = sampleInfo?.height ?? terrainHelpers.getHeight(worldX, worldZ, step)
			}

			heightCache[i * sampleCount + j] = height
			const posIndex = vertIndex * 3
			const uvIndex = vertIndex * 2

			// Position - use original local coordinates
			// Height interpolation at LOD boundaries handles seamless stitching
			positions[posIndex] = localX - halfSize
			positions[posIndex + 1] = height
			positions[posIndex + 2] = localZ - halfSize

			// UVs - use snapped world coordinates at LOD boundaries
			// Terrain shader uses vWorldPos.xz (not UVs) for texturing
			// Water shader uses UVs for wave calculations - snapping ensures seamless waves
			uvs[uvIndex] = uvWorldX
			uvs[uvIndex + 1] = uvWorldZ

			if (USE_ROAD_ATTRIBUTES) {
				writeSurfaceWeights(sampleInfo?.surface, roadWeights, roadParams, vertIndex)
			}

			// Climate attribute: (continentalness, moisture, mountain relief, reserved)
			// Slow-varying fields — vertex interpolation is plenty of resolution.
			if (USE_CLIMATE_ATTRIBUTES) {
				const climate = sampleInfo?.climate
				const climateIndex = vertIndex * 4
				climateAttr[climateIndex] = climate?.continental ?? 0
				climateAttr[climateIndex + 1] = climate?.moisture ?? 0.5
				climateAttr[climateIndex + 2] = climate?.mountain ?? 0
				climateAttr[climateIndex + 3] = 0
			}

			// Calculate water depth. Flow defaults to zero; future splines can
			// populate the water geometry's flowDir attribute without terrain sampling.
			if (height < WATER_CONFIG.level) {
				if (!depths) depths = new Float32Array(totalSamples)
				depths[vertIndex] = WATER_CONFIG.level - height
				hasWater = true
			} else {
				allWater = false
			}
			vertIndex++
		}
	}

	// Second pass: compute normals using cached heights (finite differences)
	// For interior vertices, use cached heights. For edge vertices, sample across
	// tile boundaries to ensure consistent normals between adjacent tiles.
	vertIndex = 0
	for (let j = 0; j < sampleCount; j++) {
		const localZ = j * step
		const worldZ = originZ + localZ
		const onSouthEdge = j === 0
		const onNorthEdge = j === segments

		for (let i = 0; i < sampleCount; i++) {
			const localX = i * step
			const worldX = originX + localX
			const onWestEdge = i === 0
			const onEastEdge = i === segments
			const posIndex = vertIndex * 3

			let hL, hR, hD, hU

			// For edge vertices, sample heights across tile boundaries to ensure
			// normals match between adjacent tiles. Interior uses cached heights.
			if (onWestEdge) {
				// Sample one step outside tile boundary to the west
				hL = terrainHelpers.getHeight(worldX - step, worldZ, step)
				hR = heightCache[sampleCount + j]
			} else if (onEastEdge) {
				// Sample one step outside tile boundary to the east
				hL = heightCache[(segments - 1) * sampleCount + j]
				hR = terrainHelpers.getHeight(worldX + step, worldZ, step)
			} else {
				// Interior vertex - use cached heights
				hL = heightCache[(i - 1) * sampleCount + j]
				hR = heightCache[(i + 1) * sampleCount + j]
			}

			if (onSouthEdge) {
				// Sample one step outside tile boundary to the south
				hD = terrainHelpers.getHeight(worldX, worldZ - step, step)
				hU = heightCache[i * sampleCount + 1]
			} else if (onNorthEdge) {
				hD = heightCache[i * sampleCount + segments - 1]
				hU = terrainHelpers.getHeight(worldX, worldZ + step, step)
			} else {
				// Interior vertex - use cached heights
				hD = heightCache[i * sampleCount + j - 1]
				hU = heightCache[i * sampleCount + j + 1]
			}

			// Calculate partial derivatives (sample spacing is 2*step on both axes)
			const dhdx = (hR - hL) / (2 * step)
			const dhdz = (hU - hD) / (2 * step)

			// Normal is perpendicular to the tangent plane: (-dhdx, 1, -dhdz) normalized
			const nx = -dhdx
			const ny = 1
			const nz = -dhdz
			const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz)

			normals[posIndex] = nx * invLen
			normals[posIndex + 1] = ny * invLen
			normals[posIndex + 2] = nz * invLen

			vertIndex++
		}
	}

	// Build water vertex data if there's water in this tile
	let water = null
	if (hasWater) {
		// Create water positions (reuse terrain UVs and constant normals).
		const waterPositions = new Float32Array(totalSamples * 3)

		// Build water geometry with snapped positions at LOD boundaries
		// Both positions AND UVs need to match for seamless rendering
		for (let i = 0; i < totalSamples; i++) {
			const posIndex = i * 3
			const uvIndex = i * 2

			// Water position - use snapped UV coords (world space) converted to local
			// This ensures edge vertices have identical positions as coarse neighbor
			const localX = uvs[uvIndex] - originX - halfSize
			const localZ = uvs[uvIndex + 1] - originZ - halfSize

			waterPositions[posIndex] = localX
			waterPositions[posIndex + 1] = WATER_CONFIG.level
			waterPositions[posIndex + 2] = localZ
		}

		let waterIndices = null // null = fully underwater, use shared full index buffer
		let waterIdx = TERRAIN_INDEX_COUNT

		if (!allWater) {
			// Build water indices - only create triangles where at least one vertex is underwater.
			const waterIndicesArray = new Uint16Array(TERRAIN_INDEX_COUNT)
			waterIdx = 0

			for (let j = 0; j < segments; j++) {
				const rowOffset = sampleCount * j
				for (let i = 0; i < segments; i++) {
					const a = i + rowOffset
					const b = a + 1
					const c = a + sampleCount
					const d = c + 1

					if (depths[a] > 0 || depths[b] > 0 || depths[c] > 0 || depths[d] > 0) {
						waterIndicesArray[waterIdx++] = a
						waterIndicesArray[waterIdx++] = c
						waterIndicesArray[waterIdx++] = b
						waterIndicesArray[waterIdx++] = b
						waterIndicesArray[waterIdx++] = c
						waterIndicesArray[waterIdx++] = d
					}
				}
			}

			waterIndices = waterIndicesArray.slice(0, waterIdx)
		}

		if (waterIdx > 0) {
			water = { positions: waterPositions, depths, indices: waterIndices }
		}
	}

	return { positions, normals, uvs, roadWeights, roadParams, climateAttr, heightCache, water }
}
