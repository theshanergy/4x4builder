import { useMemo } from 'react'
import { BufferGeometry, BufferAttribute } from 'three'
import { TILE_RESOLUTION } from '../config/terrain'
import { WATER_LEVEL } from '../config/water'

/**
 * Create water geometry for a quadtree terrain tile.
 * Only generates geometry where terrain is below water level.
 * Stores depth (distance from water surface to terrain) as a vertex attribute.
 *
 * @param {Object} node - Quadtree node with size, centerX, centerZ
 * @param {Object} terrainHelpers - Object with getWorldHeight function
 * @param {Object} edgeStitchInfo - Edge stitching configuration per direction
 * @returns {BufferGeometry|null} The generated water geometry, or null if no water in tile
 */
const useWaterGeometry = (node, terrainHelpers, edgeStitchInfo) => {
	return useMemo(() => {
		const { size, centerX, centerZ } = node
		const resolution = TILE_RESOLUTION
		const segments = resolution
		const sampleCount = segments + 1
		const step = size / segments
		const halfSize = size / 2
		const originX = centerX - halfSize
		const originZ = centerZ - halfSize

		// First pass: determine which vertices are underwater and count them
		const vertexData = []
		let hasWater = false

		/**
		 * Get interpolated terrain height for stitched edges.
		 * Snaps height samples to the coarser neighbor's grid.
		 */
		const getStitchedTerrainHeight = (worldX, worldZ, neighborStep, axis) => {
			if (axis === 'x') {
				const gridX = worldX / neighborStep
				const x0 = Math.floor(gridX) * neighborStep
				const x1 = x0 + neighborStep
				const t = (worldX - x0) / neighborStep

				const h0 = terrainHelpers.getWorldHeight(x0, worldZ)
				const h1 = terrainHelpers.getWorldHeight(x1, worldZ)
				return h0 * (1 - t) + h1 * t
			} else {
				const gridZ = worldZ / neighborStep
				const z0 = Math.floor(gridZ) * neighborStep
				const z1 = z0 + neighborStep
				const t = (worldZ - z0) / neighborStep

				const h0 = terrainHelpers.getWorldHeight(worldX, z0)
				const h1 = terrainHelpers.getWorldHeight(worldX, z1)
				return h0 * (1 - t) + h1 * t
			}
		}

		// Generate vertex data
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

				// Get terrain height, applying edge stitching if needed
				let terrainHeight

				if (onWestEdge && edgeStitchInfo.west.needsStitch) {
					terrainHeight = getStitchedTerrainHeight(worldX, worldZ, edgeStitchInfo.west.neighborStep, 'z')
				} else if (onEastEdge && edgeStitchInfo.east.needsStitch) {
					terrainHeight = getStitchedTerrainHeight(worldX, worldZ, edgeStitchInfo.east.neighborStep, 'z')
				} else if (onSouthEdge && edgeStitchInfo.south.needsStitch) {
					terrainHeight = getStitchedTerrainHeight(worldX, worldZ, edgeStitchInfo.south.neighborStep, 'x')
				} else if (onNorthEdge && edgeStitchInfo.north.needsStitch) {
					terrainHeight = getStitchedTerrainHeight(worldX, worldZ, edgeStitchInfo.north.neighborStep, 'x')
				} else {
					terrainHeight = terrainHelpers.getWorldHeight(worldX, worldZ)
				}

				const isUnderwater = terrainHeight < WATER_LEVEL
				const depth = isUnderwater ? WATER_LEVEL - terrainHeight : 0

				if (isUnderwater) {
					hasWater = true
				}

				vertexData.push({
					i,
					j,
					localX,
					localZ,
					worldX,
					worldZ,
					isUnderwater,
					depth,
				})
			}
		}

		// If no water in this tile, return null
		if (!hasWater) {
			return null
		}

		// Create full grid geometry (needed for proper mesh topology)
		// All vertices get positions, but non-water vertices get depth=0
		const totalVertices = sampleCount * sampleCount
		const positions = new Float32Array(totalVertices * 3)
		const normals = new Float32Array(totalVertices * 3)
		const uvs = new Float32Array(totalVertices * 2)
		const depths = new Float32Array(totalVertices)

		for (let idx = 0; idx < vertexData.length; idx++) {
			const v = vertexData[idx]
			const posIndex = idx * 3
			const uvIndex = idx * 2

			// Position: local coordinates centered on tile, Y at water level
			// Using WATER_LEVEL directly since tile group is at Y=0
			positions[posIndex] = v.localX - halfSize
			positions[posIndex + 1] = WATER_LEVEL
			positions[posIndex + 2] = v.localZ - halfSize

			// Normal: pointing up for flat water surface (waves added in shader)
			normals[posIndex] = 0
			normals[posIndex + 1] = 1
			normals[posIndex + 2] = 0

			// UVs in world space for seamless texturing
			uvs[uvIndex] = v.worldX
			uvs[uvIndex + 1] = v.worldZ

			// Depth attribute for wave modulation
			depths[idx] = v.depth
		}

		// Build indices - only create triangles where at least one vertex is underwater
		const indices = []
		for (let j = 0; j < segments; j++) {
			for (let i = 0; i < segments; i++) {
				const a = i + sampleCount * j
				const b = i + 1 + sampleCount * j
				const c = i + sampleCount * (j + 1)
				const d = i + 1 + sampleCount * (j + 1)

				// Check if any vertex in this quad is underwater
				const aUnderwater = vertexData[a].isUnderwater
				const bUnderwater = vertexData[b].isUnderwater
				const cUnderwater = vertexData[c].isUnderwater
				const dUnderwater = vertexData[d].isUnderwater

				if (aUnderwater || bUnderwater || cUnderwater || dUnderwater) {
					// Two triangles per quad
					indices.push(a, c, b)
					indices.push(b, c, d)
				}
			}
		}

		// If no triangles were created, return null
		if (indices.length === 0) {
			return null
		}

		// Build geometry
		const geom = new BufferGeometry()
		geom.setAttribute('position', new BufferAttribute(positions, 3))
		geom.setAttribute('normal', new BufferAttribute(normals, 3))
		geom.setAttribute('uv', new BufferAttribute(uvs, 2))
		geom.setAttribute('depth', new BufferAttribute(depths, 1))
		geom.setIndex(indices)

		return geom
	}, [node, terrainHelpers, edgeStitchInfo])
}

export default useWaterGeometry
