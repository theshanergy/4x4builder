import { useMemo } from 'react'
import { BufferGeometry, BufferAttribute } from 'three'
import { TILE_RESOLUTION } from '../config/lod'
import { WATER_LEVEL } from '../config/water'

/**
 * Create geometry for a quadtree terrain tile.
 * Handles edge stitching to prevent cracks between LOD levels.
 * Also generates water geometry if terrain is below water level.
 *
 * @param {Object} node - Quadtree node with size, centerX, centerZ
 * @param {Object} terrainHelpers - Object with getRawHeight, getNormal, and baseHeightScale
 * @param {Object} edgeStitchInfo - Edge stitching configuration per direction
 * @returns {Object} Object containing { terrainGeometry, waterGeometry } (waterGeometry may be null)
 */
const useTerrainGeometry = (node, terrainHelpers, edgeStitchInfo) => {
	return useMemo(() => {
		const { baseHeightScale } = terrainHelpers
		const { size, centerX, centerZ } = node
		const resolution = TILE_RESOLUTION
		const segments = resolution
		const sampleCount = segments + 1
		const totalSamples = sampleCount * sampleCount
		const step = size / segments
		const halfSize = size / 2
		const originX = centerX - halfSize
		const originZ = centerZ - halfSize

		const positions = new Float32Array(totalSamples * 3)
		const normals = new Float32Array(totalSamples * 3)
		const uvs = new Float32Array(totalSamples * 2)

		// Track water depth for each vertex
		const depths = new Float32Array(totalSamples)
		let hasWater = false

		// Cache for height samples - avoids recomputing for normal calculation
		// Layout: heightCache[j * sampleCount + i] = normalized height at grid position (i, j)
		const heightCache = new Float32Array(totalSamples)

		// Track interpolated world coordinates for UVs
		// At LOD boundaries, these are snapped to match coarse neighbor
		const worldXForUV = new Float32Array(totalSamples)
		const worldZForUV = new Float32Array(totalSamples)

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
			if (axis === 'x') {
				const gridX = worldX / neighborStep
				const x0 = Math.floor(gridX) * neighborStep
				const x1 = x0 + neighborStep
				const t = (worldX - x0) / neighborStep

				const h0 = terrainHelpers.getNormalizedHeight(x0, worldZ)
				const h1 = terrainHelpers.getNormalizedHeight(x1, worldZ)
				return (h0 * (1 - t) + h1 * t) * baseHeightScale
			} else {
				const gridZ = worldZ / neighborStep
				const z0 = Math.floor(gridZ) * neighborStep
				const z1 = z0 + neighborStep
				const t = (worldZ - z0) / neighborStep

				const h0 = terrainHelpers.getNormalizedHeight(worldX, z0)
				const h1 = terrainHelpers.getNormalizedHeight(worldX, z1)
				return (h0 * (1 - t) + h1 * t) * baseHeightScale
			}
		}

		// Pre-compute stitch decisions for all edge vertices to avoid redundant checks
		// This caches which vertices need stitching and what parameters to use
		const stitchCache = new Map()
		for (let j = 0; j < sampleCount; j++) {
			const onSouthEdge = j === 0
			const onNorthEdge = j === segments
			for (let i = 0; i < sampleCount; i++) {
				const onWestEdge = i === 0
				const onEastEdge = i === segments

				// Only cache edge vertices that need stitching
				if (onWestEdge && westNeedsStitch) {
					stitchCache.set(j * sampleCount + i, { step: westStep, axis: 'z' })
				} else if (onEastEdge && eastNeedsStitch) {
					stitchCache.set(j * sampleCount + i, { step: eastStep, axis: 'z' })
				} else if (onSouthEdge && southNeedsStitch) {
					stitchCache.set(j * sampleCount + i, { step: southStep, axis: 'x' })
				} else if (onNorthEdge && northNeedsStitch) {
					stitchCache.set(j * sampleCount + i, { step: northStep, axis: 'x' })
				}
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
				let uvWorldX = worldX
				let uvWorldZ = worldZ

				// Check stitch cache for this vertex
				const stitchInfo = stitchCache.get(vertIndex)
				if (stitchInfo) {
					// Apply cached stitch parameters
					height = getStitchedHeight(worldX, worldZ, stitchInfo.step, stitchInfo.axis)
					heightCache[vertIndex] = height / baseHeightScale

					// Snap UVs to coarse neighbor's grid points
					// Water shader uses UVs for wave calculations
					if (stitchInfo.axis === 'z') {
						uvWorldZ = Math.round(worldZ / stitchInfo.step) * stitchInfo.step
					} else {
						uvWorldX = Math.round(worldX / stitchInfo.step) * stitchInfo.step
					}
				} else {
					// No stitching needed - sample directly
					const normalizedHeight = terrainHelpers.getNormalizedHeight(worldX, worldZ)
					heightCache[vertIndex] = normalizedHeight
					height = normalizedHeight * baseHeightScale
				}
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

				// Store for water geometry construction
				worldXForUV[vertIndex] = uvWorldX
				worldZForUV[vertIndex] = uvWorldZ

				// Calculate water depth
				if (height < WATER_LEVEL) {
					depths[vertIndex] = WATER_LEVEL - height
					hasWater = true
				} else {
					depths[vertIndex] = 0
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
			const rowOffset = j * sampleCount

			for (let i = 0; i < sampleCount; i++) {
				const localX = i * step
				const worldX = originX + localX
				const onWestEdge = i === 0
				const onEastEdge = i === segments
				const posIndex = vertIndex * 3

				let hL, hR, hD, hU
				let dx, dz

				// For edge vertices, sample heights across tile boundaries to ensure
				// normals match between adjacent tiles. Interior uses cached heights.
				if (onWestEdge) {
					// Sample one step outside tile boundary to the west
					hL = terrainHelpers.getNormalizedHeight(worldX - step, worldZ) * baseHeightScale
					hR = heightCache[rowOffset + 1] * baseHeightScale
					dx = 2 * step
				} else if (onEastEdge) {
					// Sample one step outside tile boundary to the east
					hL = heightCache[rowOffset + segments - 1] * baseHeightScale
					hR = terrainHelpers.getNormalizedHeight(worldX + step, worldZ) * baseHeightScale
					dx = 2 * step
				} else {
					// Interior vertex - use cached heights
					hL = heightCache[rowOffset + i - 1] * baseHeightScale
					hR = heightCache[rowOffset + i + 1] * baseHeightScale
					dx = 2 * step
				}

				if (onSouthEdge) {
					// Sample one step outside tile boundary to the south
					hD = terrainHelpers.getNormalizedHeight(worldX, worldZ - step) * baseHeightScale
					hU = heightCache[sampleCount + i] * baseHeightScale
					dz = 2 * step
				} else if (onNorthEdge) {
					// Sample one step outside tile boundary to the north
					hD = heightCache[(segments - 1) * sampleCount + i] * baseHeightScale
					hU = terrainHelpers.getNormalizedHeight(worldX, worldZ + step) * baseHeightScale
					dz = 2 * step
				} else {
					// Interior vertex - use cached heights
					hD = heightCache[(j - 1) * sampleCount + i] * baseHeightScale
					hU = heightCache[(j + 1) * sampleCount + i] * baseHeightScale
					dz = 2 * step
				}

				// Calculate partial derivatives
				const dhdx = (hR - hL) / dx
				const dhdz = (hU - hD) / dz

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

		// Build indices for the grid - pre-allocate for performance
		const numTriangles = segments * segments * 2
		const indices = new Uint32Array(numTriangles * 3)
		let idx = 0

		for (let j = 0; j < segments; j++) {
			const rowOffset = sampleCount * j
			for (let i = 0; i < segments; i++) {
				const a = i + rowOffset
				const b = a + 1
				const c = a + sampleCount
				const d = c + 1

				// Two triangles per quad
				indices[idx++] = a
				indices[idx++] = c
				indices[idx++] = b
				indices[idx++] = b
				indices[idx++] = c
				indices[idx++] = d
			}
		}

		// Build terrain geometry
		const terrainGeom = new BufferGeometry()
		terrainGeom.setAttribute('position', new BufferAttribute(positions, 3))
		terrainGeom.setAttribute('normal', new BufferAttribute(normals, 3))
		terrainGeom.setAttribute('uv', new BufferAttribute(uvs, 2))
		terrainGeom.setIndex(new BufferAttribute(indices, 1))

		// Build water geometry if there's water in this tile
		let waterGeom = null
		if (hasWater) {
			// Create water positions and normals (reuse terrain UVs)
			const waterPositions = new Float32Array(totalSamples * 3)
			const waterNormals = new Float32Array(totalSamples * 3)

			// Build water geometry with snapped positions at LOD boundaries
			// Both positions AND UVs need to match for seamless rendering
			for (let i = 0; i < totalSamples; i++) {
				const posIndex = i * 3
				const uvIndex = i * 2

				// Water position - use snapped UV coords (world space) converted to local
				// This ensures edge vertices have identical positions as coarse neighbor
				const localX = worldXForUV[i] - originX - halfSize
				const localZ = worldZForUV[i] - originZ - halfSize

				waterPositions[posIndex] = localX
				waterPositions[posIndex + 1] = WATER_LEVEL
				waterPositions[posIndex + 2] = localZ

				// Normal pointing up (waves added in shader)
				waterNormals[posIndex] = 0
				waterNormals[posIndex + 1] = 1
				waterNormals[posIndex + 2] = 0
			}

			// Build water indices - only create triangles where at least one vertex is underwater
			// Pre-allocate maximum possible size (all quads underwater)
			const maxWaterIndices = numTriangles * 3
			const waterIndicesArray = new Uint32Array(maxWaterIndices)
			let waterIdx = 0

			for (let j = 0; j < segments; j++) {
				const rowOffset = sampleCount * j
				for (let i = 0; i < segments; i++) {
					const a = i + rowOffset
					const b = a + 1
					const c = a + sampleCount
					const d = c + 1

					// Check if any vertex in this quad is underwater
					if (depths[a] > 0 || depths[b] > 0 || depths[c] > 0 || depths[d] > 0) {
						// Two triangles per quad
						waterIndicesArray[waterIdx++] = a
						waterIndicesArray[waterIdx++] = c
						waterIndicesArray[waterIdx++] = b
						waterIndicesArray[waterIdx++] = b
						waterIndicesArray[waterIdx++] = c
						waterIndicesArray[waterIdx++] = d
					}
				}
			}

			// Only create water geometry if we have triangles
			if (waterIdx > 0) {
				waterGeom = new BufferGeometry()
				waterGeom.setAttribute('position', new BufferAttribute(waterPositions, 3))
				waterGeom.setAttribute('normal', new BufferAttribute(waterNormals, 3))
				waterGeom.setAttribute('uv', new BufferAttribute(uvs, 2)) // Reuse terrain UVs
				waterGeom.setAttribute('depth', new BufferAttribute(depths, 1))
				// Use slice to trim to actual size used
				waterGeom.setIndex(new BufferAttribute(waterIndicesArray.slice(0, waterIdx), 1))
			}
		}

		return { terrainGeometry: terrainGeom, waterGeometry: waterGeom }
	}, [node, terrainHelpers, edgeStitchInfo])
}

export default useTerrainGeometry
