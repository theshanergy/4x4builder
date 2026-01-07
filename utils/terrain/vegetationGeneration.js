import { Vector3, Object3D } from 'three'
import { createSeededRandom, hashCoords } from '../seededRandom'

/**
 * Vegetation Generation Utilities
 *
 * Pure functions for generating vegetation positions and matrices.
 * These functions are deterministic and side-effect free.
 */

// Pre-allocated scratch objects for matrix generation
const _scratchDummy = new Object3D()
const _normalScratch = new Vector3()

/**
 * Generate vegetation positions and matrices for a specific terrain tile.
 * Vegetation is placed deterministically based on absolute world grid positions.
 * This ensures the same vegetation always appears at the same location regardless of LOD.
 *
 * @param {Object} node - Quadtree node (tile) with centerX, centerZ, size
 * @param {Object} terrainHelpers - Terrain height/normal sampling functions
 * @param {number} lodLevel - LOD level (0 = highest detail, 3 = lowest)
 * @param {Object} config - Vegetation configuration object
 * @returns {Array} Array of vegetation matrices
 */
export const generateVegetationForTile = (node, terrainHelpers, lodLevel, config) => {
	const { centerX, centerZ, size } = node
	const { getWorldHeight, getNormal } = terrainHelpers
	const { scale, slopeThreshold, heightOffset, density, gridSpacing, maxVegetationPerTile } = config

	const dummy = _scratchDummy
	const matrices = []

	// Adjust density based on tile size to prevent too many vegetation on large tiles
	const adjustedDensity = density * Math.min(1, 128 / size)

	// Calculate grid bounds for vegetation placement
	const halfSize = size / 2
	const minX = centerX - halfSize
	const maxX = centerX + halfSize
	const minZ = centerZ - halfSize
	const maxZ = centerZ + halfSize

	// Snap to world grid to ensure deterministic placement
	const startX = Math.floor(minX / gridSpacing) * gridSpacing
	const startZ = Math.floor(minZ / gridSpacing) * gridSpacing

	// Generate vegetation on a world-aligned grid
	for (let x = startX; x < maxX; x += gridSpacing) {
		for (let z = startZ; z < maxZ; z += gridSpacing) {
			// Skip if outside tile bounds
			if (x < minX || x >= maxX || z < minZ || z >= maxZ) continue

			// Stop if we've reached max vegetation for this tile
			if (matrices.length >= maxVegetationPerTile) break

			// Use grid position to generate consistent seed for this vegetation location
			const gridX = Math.floor(x / gridSpacing)
			const gridZ = Math.floor(z / gridSpacing)
			const seed = hashCoords(gridX, gridZ, 88888)
			const random = createSeededRandom(seed)

			// Density check (same for this location across all LODs)
			if (random() > adjustedDensity) continue

			// Add random offset within grid cell (same for this location)
			const offsetX = (random() - 0.5) * gridSpacing * 0.8
			const offsetZ = (random() - 0.5) * gridSpacing * 0.8
			const vegetationX = x + offsetX
			const vegetationZ = z + offsetZ

			// Skip if offset moved it outside tile bounds
			if (vegetationX < minX || vegetationX >= maxX || vegetationZ < minZ || vegetationZ >= maxZ) continue

			// Get terrain normal and check slope
			const terrainNormal = getNormal(vegetationX, vegetationZ, _normalScratch)
			if (terrainNormal.y < slopeThreshold) continue

			// Get terrain height
			const vegetationY = getWorldHeight(vegetationX, vegetationZ) + heightOffset

			// Random scale and rotation (same for this location)
			const vegetationScale = scale.min + random() * (scale.max - scale.min)
			const rotationY = random() * Math.PI * 2

			// Set transform
			dummy.position.set(vegetationX, vegetationY, vegetationZ)
			dummy.rotation.set(0, rotationY, 0) // Random Y rotation only
			dummy.scale.setScalar(vegetationScale)
			dummy.updateMatrix() // Store matrix
			matrices.push(dummy.matrix.clone())
		}
		if (matrices.length >= maxVegetationPerTile) break
	}

	return matrices
}

/**
 * Get the appropriate vegetation LOD level based on terrain tile size/depth.
 * - Smallest tiles (32-64) = LOD0 (highest detail)
 * - Medium tiles (128-256) = LOD1
 * - Large tiles (512-1024) = LOD2
 * - Largest tiles (2048+) = LOD3 (lowest detail)
 *
 * @param {number} tileSize - Size of the terrain tile
 * @returns {number} LOD level (0-3)
 */
export const getVegetationLODForTileSize = (tileSize) => {
	if (tileSize <= 64) return 0
	if (tileSize <= 256) return 1
	if (tileSize <= 1024) return 2
	return 3
}
