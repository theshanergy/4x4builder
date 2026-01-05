import { useMemo } from 'react'
import { BufferGeometry, BufferAttribute } from 'three'
import { TILE_RESOLUTION } from '../config/terrain'
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

		// Pre-allocate water arrays (cheaper than lazy allocation with backfill)
		const waterSnappedX = new Float32Array(totalSamples)
		const waterSnappedZ = new Float32Array(totalSamples)

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

		/**
		 * Snap a coordinate to the nearest coarse grid position.
		 * Used for water geometry to collapse edge vertices to match coarse neighbor's grid.
		 */
		const snapToCoarseGrid = (coord, neighborStep) => {
			return Math.round(coord / neighborStep) * neighborStep
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
				let snappedWorldX = worldX
				let snappedWorldZ = worldZ

				// Check stitch cache for this vertex
				const stitchInfo = stitchCache.get(vertIndex)
				if (stitchInfo) {
					// Apply cached stitch parameters
					height = getStitchedHeight(worldX, worldZ, stitchInfo.step, stitchInfo.axis)
					if (stitchInfo.axis === 'z') {
						snappedWorldZ = snapToCoarseGrid(worldZ, stitchInfo.step)
					} else {
						snappedWorldX = snapToCoarseGrid(worldX, stitchInfo.step)
					}
					heightCache[vertIndex] = height / baseHeightScale
				} else {
					// No stitching needed - sample directly
					const normalizedHeight = terrainHelpers.getNormalizedHeight(worldX, worldZ)
					heightCache[vertIndex] = normalizedHeight
					height = normalizedHeight * baseHeightScale
				}

				const posIndex = vertIndex * 3
				const uvIndex = vertIndex * 2

				// TERRAIN position - use original local coordinates (not snapped)
				// Height stitching handles the LOD boundary for terrain
				positions[posIndex] = localX - halfSize
				positions[posIndex + 1] = height
				positions[posIndex + 2] = localZ - halfSize

				// TERRAIN UVs - use original world coordinates
				uvs[uvIndex] = worldX
				uvs[uvIndex + 1] = worldZ

				// Calculate water depth and populate water arrays
				if (height < WATER_LEVEL) {
					depths[vertIndex] = WATER_LEVEL - height
					hasWater = true
				} else {
					depths[vertIndex] = 0
				}
				
				// Always populate water coordinate arrays (pre-allocated)
				waterSnappedX[vertIndex] = snappedWorldX
				waterSnappedZ[vertIndex] = snappedWorldZ

				vertIndex++
			}
		}

		// Second pass: compute normals using cached heights (finite differences)
		// This avoids redundant getNormalizedHeight calls for normal computation
		vertIndex = 0
		for (let j = 0; j < sampleCount; j++) {
			const rowOffset = j * sampleCount
			// Pre-compute clamped row indices to reduce repeated clamping
			const jD = Math.max(0, j - 1)
			const jU = Math.min(segments, j + 1)
			const dz = (jU - jD) * step
			
			for (let i = 0; i < sampleCount; i++) {
				const posIndex = vertIndex * 3

				// Use cached heights for finite difference normal calculation
				// Get neighboring heights from cache, clamping to grid boundaries
				const iL = Math.max(0, i - 1)
				const iR = Math.min(segments, i + 1)

				const hL = heightCache[rowOffset + iL] * baseHeightScale
				const hR = heightCache[rowOffset + iR] * baseHeightScale
				const hD = heightCache[jD * sampleCount + i] * baseHeightScale
				const hU = heightCache[jU * sampleCount + i] * baseHeightScale

				// Calculate partial derivatives using central/forward/backward differences
				const dx = (iR - iL) * step
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
			// Create water positions at WATER_LEVEL with snapped coordinates for LOD boundaries
			const waterPositions = new Float32Array(totalSamples * 3)
			const waterNormals = new Float32Array(totalSamples * 3)
			const waterUvs = new Float32Array(totalSamples * 2)

			// Build water geometry with snapped positions for seamless LOD boundaries
			for (let i = 0; i < totalSamples; i++) {
				const posIndex = i * 3
				const uvIndex = i * 2

				// WATER position - use snapped coordinates (creates degenerate tris at boundaries)
				// This ensures edge vertices have identical world positions as the coarse neighbor
				waterPositions[posIndex] = waterSnappedX[i] - originX - halfSize
				waterPositions[posIndex + 1] = WATER_LEVEL
				waterPositions[posIndex + 2] = waterSnappedZ[i] - originZ - halfSize

				// Normal pointing up (waves added in shader)
				waterNormals[posIndex] = 0
				waterNormals[posIndex + 1] = 1
				waterNormals[posIndex + 2] = 0

				// WATER UVs - use snapped world coordinates for seamless wave calculation
				waterUvs[uvIndex] = waterSnappedX[i]
				waterUvs[uvIndex + 1] = waterSnappedZ[i]
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
				waterGeom.setAttribute('uv', new BufferAttribute(waterUvs, 2))
				waterGeom.setAttribute('depth', new BufferAttribute(depths, 1))
				// Use slice to trim to actual size used
				waterGeom.setIndex(new BufferAttribute(waterIndicesArray.slice(0, waterIdx), 1))
			}
		}

		return { terrainGeometry: terrainGeom, waterGeometry: waterGeom }
	}, [node, terrainHelpers, edgeStitchInfo])
}

export default useTerrainGeometry
