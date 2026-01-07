import { Vector3, Object3D } from 'three'

/**
 * Tree Generation Utilities
 * 
 * Pure functions for generating tree positions and matrices.
 * These functions are deterministic and side-effect free.
 */

// Seeded random number generator (mulberry32)
const createSeededRandom = (seed) => {
	let state = seed
	return () => {
		state = (state + 0x6d2b79f5) | 0
		let t = Math.imul(state ^ (state >>> 15), state | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

// Hash function for generating consistent seeds from tile coordinates
const hashCoords = (x, z, salt = 0) => {
	const h = (x * 374761393 + z * 668265263 + salt * 1013904223) | 0
	return Math.abs(h)
}

// Pre-allocated scratch objects for matrix generation
const _scratchDummy = new Object3D()
const _normalScratch = new Vector3()

/**
 * Generate tree positions and matrices for a specific terrain tile.
 * Trees are placed deterministically based on absolute world grid positions.
 * This ensures the same tree always appears at the same location regardless of LOD.
 * 
 * @param {Object} node - Quadtree node (tile) with centerX, centerZ, size
 * @param {Object} terrainHelpers - Terrain height/normal sampling functions
 * @param {number} lodLevel - LOD level (0 = highest detail, 3 = lowest)
 * @param {Object} config - Tree configuration object
 * @returns {Array} Array of tree matrices
 */
export const generateTreesForTile = (node, terrainHelpers, lodLevel, config) => {
	const { centerX, centerZ, size } = node
	const { getWorldHeight, getNormal } = terrainHelpers
	const { scale, slopeThreshold, heightOffset, density, gridSpacing, maxTreesPerTile } = config

	const dummy = _scratchDummy
	const matrices = []

	// Adjust density based on tile size to prevent too many trees on large tiles
	const adjustedDensity = density * Math.min(1, 128 / size)

	// Calculate grid bounds for tree placement
	const halfSize = size / 2
	const minX = centerX - halfSize
	const maxX = centerX + halfSize
	const minZ = centerZ - halfSize
	const maxZ = centerZ + halfSize

	// Snap to world grid to ensure deterministic placement
	const startX = Math.floor(minX / gridSpacing) * gridSpacing
	const startZ = Math.floor(minZ / gridSpacing) * gridSpacing

	// Generate trees on a world-aligned grid
	for (let x = startX; x < maxX; x += gridSpacing) {
		for (let z = startZ; z < maxZ; z += gridSpacing) {
			// Skip if outside tile bounds
			if (x < minX || x >= maxX || z < minZ || z >= maxZ) continue

			// Stop if we've reached max trees for this tile
			if (matrices.length >= maxTreesPerTile) break

			// Use grid position to generate consistent seed for this tree location
			const gridX = Math.floor(x / gridSpacing)
			const gridZ = Math.floor(z / gridSpacing)
			const seed = hashCoords(gridX, gridZ, 88888)
			const random = createSeededRandom(seed)

			// Density check (same for this location across all LODs)
			if (random() > adjustedDensity) continue

			// Add random offset within grid cell (same for this location)
			const offsetX = (random() - 0.5) * gridSpacing * 0.8
			const offsetZ = (random() - 0.5) * gridSpacing * 0.8
			const treeX = x + offsetX
			const treeZ = z + offsetZ

			// Skip if offset moved it outside tile bounds
			if (treeX < minX || treeX >= maxX || treeZ < minZ || treeZ >= maxZ) continue

			// Get terrain normal and check slope
			const terrainNormal = getNormal(treeX, treeZ, _normalScratch)
			if (terrainNormal.y < slopeThreshold) continue

			// Get terrain height
			const treeY = getWorldHeight(treeX, treeZ) + heightOffset

			// Random scale and rotation (same for this location)
			const treeScale = scale.min + random() * (scale.max - scale.min)
			const rotationY = random() * Math.PI * 2

		// Set transform
		dummy.position.set(treeX, treeY, treeZ)
		dummy.rotation.set(0, rotationY, 0) // Random Y rotation only
		dummy.scale.setScalar(treeScale)
		dummy.updateMatrix()			// Store matrix
			matrices.push(dummy.matrix.clone())
		}
		if (matrices.length >= maxTreesPerTile) break
	}

	return matrices
}

/**
 * Get the appropriate tree LOD level based on terrain tile size/depth.
 * - Smallest tiles (32-64) = LOD0 (highest detail)
 * - Medium tiles (128-256) = LOD1
 * - Large tiles (512-1024) = LOD2
 * - Largest tiles (2048+) = LOD3 (lowest detail)
 * 
 * @param {number} tileSize - Size of the terrain tile
 * @returns {number} LOD level (0-3)
 */
export const getTreeLODForTileSize = (tileSize) => {
	if (tileSize <= 64) return 0
	if (tileSize <= 256) return 1
	if (tileSize <= 1024) return 2
	return 3
}
