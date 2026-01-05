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

		const normalVec = new Vector3()

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

		// Generate vertices
		for (let i = 0; i < sampleCount; i++) {
			const localX = i * step
			const worldX = originX + localX
			const onWestEdge = i === 0
			const onEastEdge = i === segments

			for (let j = 0; j < sampleCount; j++) {
				const localZ = j * step
				const worldZ = originZ + localZ
				const onSouthEdge = j === 0
				const onNorthEdge = j === segments

				let height

				// Apply edge stitching - check edges in priority order
				if (onWestEdge && edgeStitchInfo.west.needsStitch) {
					height = getStitchedHeight(worldX, worldZ, edgeStitchInfo.west.neighborStep, 'z')
				} else if (onEastEdge && edgeStitchInfo.east.needsStitch) {
					height = getStitchedHeight(worldX, worldZ, edgeStitchInfo.east.neighborStep, 'z')
				} else if (onSouthEdge && edgeStitchInfo.south.needsStitch) {
					height = getStitchedHeight(worldX, worldZ, edgeStitchInfo.south.neighborStep, 'x')
				} else if (onNorthEdge && edgeStitchInfo.north.needsStitch) {
					height = getStitchedHeight(worldX, worldZ, edgeStitchInfo.north.neighborStep, 'x')
				} else {
					height = terrainHelpers.getNormalizedHeight(worldX, worldZ) * baseHeightScale
				}

				const vertIndex = i + sampleCount * j
				const posIndex = vertIndex * 3
				const uvIndex = vertIndex * 2

				// Position centered on node
				positions[posIndex] = localX - halfSize
				positions[posIndex + 1] = height
				positions[posIndex + 2] = localZ - halfSize

				// Normal
				terrainHelpers.getNormal(worldX, worldZ, normalVec)
				normals[posIndex] = normalVec.x
				normals[posIndex + 1] = normalVec.y
				normals[posIndex + 2] = normalVec.z

				// UVs in world space for seamless texturing
				uvs[uvIndex] = worldX
				uvs[uvIndex + 1] = worldZ

				// Calculate water depth
				const isUnderwater = height < WATER_LEVEL
				depths[vertIndex] = isUnderwater ? WATER_LEVEL - height : 0
				if (isUnderwater) {
					hasWater = true
				}
			}
		}

		// Build indices for the grid
		const indices = []
		for (let i = 0; i < segments; i++) {
			for (let j = 0; j < segments; j++) {
				const a = i + sampleCount * j
				const b = i + 1 + sampleCount * j
				const c = i + sampleCount * (j + 1)
				const d = i + 1 + sampleCount * (j + 1)

				// Two triangles per quad
				indices.push(a, c, b)
				indices.push(b, c, d)
			}
		}

		// Build terrain geometry
		const terrainGeom = new BufferGeometry()
		terrainGeom.setAttribute('position', new BufferAttribute(positions, 3))
		terrainGeom.setAttribute('normal', new BufferAttribute(normals, 3))
		terrainGeom.setAttribute('uv', new BufferAttribute(uvs, 2))
		terrainGeom.setIndex(indices)

		// Build water geometry if there's water in this tile
		let waterGeom = null
		if (hasWater) {
			// Create water positions at WATER_LEVEL
			const waterPositions = new Float32Array(totalSamples * 3)
			const waterNormals = new Float32Array(totalSamples * 3)
			const waterUvs = new Float32Array(totalSamples * 2)

			for (let i = 0; i < sampleCount; i++) {
				const localX = i * step
				for (let j = 0; j < sampleCount; j++) {
					const localZ = j * step
					const vertIndex = i + sampleCount * j
					const posIndex = vertIndex * 3
					const uvIndex = vertIndex * 2

					// Position at water level
					waterPositions[posIndex] = localX - halfSize
					waterPositions[posIndex + 1] = WATER_LEVEL
					waterPositions[posIndex + 2] = localZ - halfSize

					// Normal pointing up (waves added in shader)
					waterNormals[posIndex] = 0
					waterNormals[posIndex + 1] = 1
					waterNormals[posIndex + 2] = 0

					// UVs in world space for seamless texturing
					const worldX = originX + localX
					const worldZ = originZ + localZ
					waterUvs[uvIndex] = worldX
					waterUvs[uvIndex + 1] = worldZ
				}
			}

			// Build water indices - only create triangles where at least one vertex is underwater
			const waterIndices = []
			for (let i = 0; i < segments; i++) {
				for (let j = 0; j < segments; j++) {
					const a = i + sampleCount * j
					const b = i + 1 + sampleCount * j
					const c = i + sampleCount * (j + 1)
					const d = i + 1 + sampleCount * (j + 1)

					// Check if any vertex in this quad is underwater
					if (depths[a] > 0 || depths[b] > 0 || depths[c] > 0 || depths[d] > 0) {
						// Two triangles per quad
						waterIndices.push(a, c, b)
						waterIndices.push(b, c, d)
					}
				}
			}

			// Only create water geometry if we have triangles
			if (waterIndices.length > 0) {
				waterGeom = new BufferGeometry()
				waterGeom.setAttribute('position', new BufferAttribute(waterPositions, 3))
				waterGeom.setAttribute('normal', new BufferAttribute(waterNormals, 3))
				waterGeom.setAttribute('uv', new BufferAttribute(waterUvs, 2))
				waterGeom.setAttribute('depth', new BufferAttribute(depths, 1))
				waterGeom.setIndex(waterIndices)
			}
		}

		return { terrainGeometry: terrainGeom, waterGeometry: waterGeom }
	}, [node, terrainHelpers, edgeStitchInfo])
}

export default useTerrainGeometry
