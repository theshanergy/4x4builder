import { useMemo } from 'react'
import { BufferGeometry, BufferAttribute, Vector3 } from 'three'
import { TILE_RESOLUTION } from '../config/terrain'

/**
 * Create geometry for a quadtree terrain tile.
 * Handles edge stitching to prevent cracks between LOD levels.
 *
 * @param {Object} node - Quadtree node with size, centerX, centerZ
 * @param {Object} terrainHelpers - Object with getRawHeight, getNormal, and baseHeightScale
 * @param {Object} edgeStitchInfo - Edge stitching configuration per direction
 * @returns {BufferGeometry} The generated terrain geometry
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

		// Build geometry
		const geom = new BufferGeometry()
		geom.setAttribute('position', new BufferAttribute(positions, 3))
		geom.setAttribute('normal', new BufferAttribute(normals, 3))
		geom.setAttribute('uv', new BufferAttribute(uvs, 2))
		geom.setIndex(indices)

		return geom
	}, [node, terrainHelpers, edgeStitchInfo])
}

export default useTerrainGeometry
