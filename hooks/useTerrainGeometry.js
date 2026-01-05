import { useMemo } from 'react'
import { BufferGeometry, BufferAttribute, Vector3 } from 'three'
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

		// Reuse Vector3 for all normal calculations
		const normalVec = new Vector3()

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
		 * Get wave stitch info for edge vertices.
		 * Returns [coarseCoord0, coarseCoord1, blendFactor] for interpolation.
		 * For non-stitched or on-grid vertices, blend factor is -1 (use actual UV).
		 */
		const getWaveStitchInfo = (coord, neighborStep) => {
			const grid = coord / neighborStep
			const gridFloor = Math.floor(grid)
			const c0 = gridFloor * neighborStep
			const c1 = c0 + neighborStep
			const t = grid - gridFloor  // 0 to 1, how far between c0 and c1
			
			// If very close to a grid point (within epsilon), no interpolation needed
			const epsilon = 0.001
			if (t < epsilon || t > 1 - epsilon) {
				return { c0: coord, c1: coord, t: -1 }  // -1 means "use actual coord"
			}
			return { c0, c1, t }
		}

		// Generate vertices
		// waveStitch stores [c0, c1, t, axis] per vertex for wave interpolation
		// axis: 0 = no stitch, 1 = stitch along X (south/north edge), 2 = stitch along Z (west/east edge)
		const waveStitch = new Float32Array(totalSamples * 4)
		
		let vertIndex = 0
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

				let height
				// Wave stitch info for this vertex
				let stitchInfo = { c0: 0, c1: 0, t: -1 }
				let stitchAxis = 0  // 0 = none, 1 = X, 2 = Z

				// Apply edge stitching - check edges in priority order
				if (onWestEdge && westNeedsStitch) {
					height = getStitchedHeight(worldX, worldZ, westStep, 'z')
					stitchInfo = getWaveStitchInfo(worldZ, westStep)
					stitchAxis = 2  // Z axis
				} else if (onEastEdge && eastNeedsStitch) {
					height = getStitchedHeight(worldX, worldZ, eastStep, 'z')
					stitchInfo = getWaveStitchInfo(worldZ, eastStep)
					stitchAxis = 2  // Z axis
				} else if (onSouthEdge && southNeedsStitch) {
					height = getStitchedHeight(worldX, worldZ, southStep, 'x')
					stitchInfo = getWaveStitchInfo(worldX, southStep)
					stitchAxis = 1  // X axis
				} else if (onNorthEdge && northNeedsStitch) {
					height = getStitchedHeight(worldX, worldZ, northStep, 'x')
					stitchInfo = getWaveStitchInfo(worldX, northStep)
					stitchAxis = 1  // X axis
				} else {
					height = terrainHelpers.getNormalizedHeight(worldX, worldZ) * baseHeightScale
				}

				const posIndex = vertIndex * 3
				const uvIndex = vertIndex * 2
				const stitchIndex = vertIndex * 4

				// Position centered on node
				positions[posIndex] = localX - halfSize
				positions[posIndex + 1] = height
				positions[posIndex + 2] = localZ - halfSize

				// Normal
				terrainHelpers.getNormal(worldX, worldZ, normalVec)
				normals[posIndex] = normalVec.x
				normals[posIndex + 1] = normalVec.y
				normals[posIndex + 2] = normalVec.z

				// UVs in world space (unstitched - shader will handle interpolation)
				uvs[uvIndex] = worldX
				uvs[uvIndex + 1] = worldZ
				
				// Wave stitch data: [c0, c1, t, axis]
				waveStitch[stitchIndex] = stitchInfo.c0
				waveStitch[stitchIndex + 1] = stitchInfo.c1
				waveStitch[stitchIndex + 2] = stitchInfo.t
				waveStitch[stitchIndex + 3] = stitchAxis

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
			// Create water positions at WATER_LEVEL
			const waterPositions = new Float32Array(totalSamples * 3)
			const waterNormals = new Float32Array(totalSamples * 3)
			const waterUvs = new Float32Array(totalSamples * 2)

			// Copy and transform positions to water level
			for (let i = 0; i < totalSamples; i++) {
				const posIndex = i * 3
				const uvIndex = i * 2

				// Position at water level (reuse x and z, set y to WATER_LEVEL)
				waterPositions[posIndex] = positions[posIndex]
				waterPositions[posIndex + 1] = WATER_LEVEL
				waterPositions[posIndex + 2] = positions[posIndex + 2]

				// Normal pointing up (waves added in shader)
				waterNormals[posIndex] = 0
				waterNormals[posIndex + 1] = 1
				waterNormals[posIndex + 2] = 0

				// Reuse UVs from terrain
				waterUvs[uvIndex] = uvs[uvIndex]
				waterUvs[uvIndex + 1] = uvs[uvIndex + 1]
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
				// Wave stitch data for seamless LOD boundaries: [c0, c1, t, axis]
				waterGeom.setAttribute('waveStitch', new BufferAttribute(waveStitch, 4))
				// Use slice to trim to actual size used
				waterGeom.setIndex(new BufferAttribute(waterIndicesArray.slice(0, waterIdx), 1))
			}
		}

		return { terrainGeometry: terrainGeom, waterGeometry: waterGeom }
	}, [node, terrainHelpers, edgeStitchInfo])
}

export default useTerrainGeometry
