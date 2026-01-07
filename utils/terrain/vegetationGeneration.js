import { Vector3, Object3D } from 'three'
import { createSeededRandom, hashCoords } from '../seededRandom'
import { QUADTREE_MIN_SIZE } from '../../config/lod'

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
 * Generate vegetation positions and matrices for a specific vegetation type on a terrain tile.
 * 
 * Uses density-based placement where density = items per 100 square meters.
 * Example: density of 0.2 means ~1 tree per 500 sq meters.
 * 
 * Placement is deterministic based on tile coordinates to ensure consistency across LODs.
 * Each tile gets a proportional number of vegetation instances based on its area.
 *
 * @param {Object} node - Quadtree node (tile) with centerX, centerZ, size
 * @param {Object} terrainHelpers - Terrain height/normal sampling functions
 * @param {number} lodLevel - LOD level (0 = highest detail, 3 = lowest)
 * @param {Object} vegetationTypeConfig - Configuration for this vegetation type (must have density)
 * @param {number} typeIndex - Index of this vegetation type (used for seeding)
 * @returns {Array} Array of vegetation matrices
 */
export const generateVegetationForType = (node, terrainHelpers, lodLevel, vegetationTypeConfig, typeIndex) => {
	const { centerX, centerZ, size } = node
	const { getWorldHeight, getNormal } = terrainHelpers
	const { scale, slope, height, density } = vegetationTypeConfig

	const dummy = _scratchDummy
	const matrices = []

	// Calculate expected number of vegetation instances for this tile
	// density = items per 100 square meters
	const tileArea = size * size
	const expectedCount = (tileArea / 100) * (density || 1.0)
	
	// Use tile coordinates for deterministic seeding
	// IMPORTANT: Use QUADTREE_MIN_SIZE for grid coordinates to ensure consistency across LOD levels
	// This ensures the same area always gets the same seed regardless of current tile size
	const gridX = Math.floor(centerX / QUADTREE_MIN_SIZE)
	const gridZ = Math.floor(centerZ / QUADTREE_MIN_SIZE)
	const tileSeed = hashCoords(gridX, gridZ, 88888 + typeIndex * 1000)
	const tileRandom = createSeededRandom(tileSeed)
	
	// Actual count can vary slightly for natural variation
	const count = Math.round(expectedCount * (0.8 + tileRandom() * 0.4))

	// Calculate tile bounds
	const halfSize = size / 2
	const minX = centerX - halfSize
	const maxX = centerX + halfSize
	const minZ = centerZ - halfSize
	const maxZ = centerZ + halfSize

	// Convert slope range (0-1) to normal Y threshold
	const slopeMinNormalY = 1 - slope.max
	const slopeMaxNormalY = 1 - slope.min

	// Attempt to place vegetation instances
	// Try more attempts than needed to account for filtering (slope, height, etc.)
	const maxAttempts = count * 10
	let attempts = 0
	
	while (matrices.length < count && attempts < maxAttempts) {
		attempts++
		
		// Generate random position within tile
		const vegetationX = minX + tileRandom() * size
		const vegetationZ = minZ + tileRandom() * size

		// Get terrain height and check height range
		const vegetationY = getWorldHeight(vegetationX, vegetationZ)
		if (vegetationY < height.min || vegetationY > height.max) continue

		// Get terrain normal and check slope
		const terrainNormal = getNormal(vegetationX, vegetationZ, _normalScratch)
		if (terrainNormal.y < slopeMinNormalY || terrainNormal.y > slopeMaxNormalY) continue

		// Random scale and rotation
		const vegetationScale = scale.min + tileRandom() * (scale.max - scale.min)
		const rotationY = tileRandom() * Math.PI * 2

		// Set transform
		dummy.position.set(vegetationX, vegetationY, vegetationZ)
		dummy.rotation.set(0, rotationY, 0)
		dummy.scale.setScalar(vegetationScale)
		dummy.updateMatrix()
		matrices.push(dummy.matrix.clone())
	}

	return matrices
}
