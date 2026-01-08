import { Vector3, Object3D } from 'three'
import { createSeededRandom, hashCoords } from '../seededRandom'
import { QUADTREE_MIN_SIZE } from '../../config/lod'

/**
 * Vegetation Generation Utilities
 *
 * Generates vegetation at a FIXED grid resolution (QUADTREE_MIN_SIZE) across the world.
 * This ensures vegetation positions are stable regardless of terrain LOD.
 *
 * Each minimum-size cell gets its own deterministic set of vegetation.
 * Larger tiles simply collect vegetation from all the cells they contain.
 */

// Pre-allocated scratch objects for matrix generation
const _scratchDummy = new Object3D()
const _normalScratch = new Vector3()

/**
 * Generate vegetation for a single minimum-size cell.
 * This is the atomic unit - positions within a cell never change.
 *
 * @param {number} cellX - Cell center X (world coordinates)
 * @param {number} cellZ - Cell center Z (world coordinates)
 * @param {Object} terrainHelpers - Height/normal sampling functions
 * @param {Object} config - Vegetation type config
 * @param {number} typeIndex - Vegetation type index for seeding
 * @returns {Array} Array of matrices for this cell
 */
const generateCellVegetation = (cellX, cellZ, terrainHelpers, config, typeIndex) => {
	const { getWorldHeight, getNormal } = terrainHelpers
	const { scale, slope, height, density } = config

	const dummy = _scratchDummy
	const matrices = []
	let matricesCount = 0

	// Cell bounds
	const halfCell = QUADTREE_MIN_SIZE / 2
	const minX = cellX - halfCell
	const minZ = cellZ - halfCell

	// Deterministic seed based on cell grid position
	const gridX = Math.floor(cellX / QUADTREE_MIN_SIZE)
	const gridZ = Math.floor(cellZ / QUADTREE_MIN_SIZE)
	const cellSeed = hashCoords(gridX, gridZ, 88888 + typeIndex * 1000)
	const random = createSeededRandom(cellSeed)

	// Convert slope range to normal Y threshold
	const slopeMinNormalY = 1 - slope.max
	const slopeMaxNormalY = 1 - slope.min

	// Calculate expected count for this cell
	// density = items per square kilometer (1,000,000 sq m)
	// Each cell is 32m × 32m = 1,024 sq m
	const cellArea = QUADTREE_MIN_SIZE * QUADTREE_MIN_SIZE
	const expectedCount = (density || 1.0) * (cellArea / 1000000)

	// Add natural variation (±20%)
	const targetCount = expectedCount * (0.8 + random() * 0.4)

	// Use Poisson sampling to determine actual count
	// This handles fractional expectedCount values properly
	let count = Math.floor(targetCount)
	if (random() < targetCount - count) {
		count++ // Probabilistically round up
	}

	// Skip if no vegetation for this cell
	if (count === 0) return matrices

	// Try to place vegetation (max 10 attempts per item)
	const maxAttempts = count * 10
	let attempts = 0

	while (matrices.length < count && attempts < maxAttempts) {
		attempts++

		// Random position within cell
		const vegX = minX + random() * QUADTREE_MIN_SIZE
		const vegZ = minZ + random() * QUADTREE_MIN_SIZE

		// Height check
		const vegY = getWorldHeight(vegX, vegZ)
		if (vegY < height.min || vegY > height.max) continue

		// Slope check
		const normal = getNormal(vegX, vegZ, _normalScratch)
		if (normal.y < slopeMinNormalY || normal.y > slopeMaxNormalY) continue

		// Random scale and rotation
		const vegScale = scale.min + random() * (scale.max - scale.min)
		const rotY = random() * Math.PI * 2

		// Build matrix
		dummy.position.set(vegX, vegY, vegZ)
		dummy.rotation.set(0, rotY, 0)
		dummy.scale.setScalar(vegScale)
		dummy.updateMatrix()
		matrices[matricesCount++] = dummy.matrix.clone()
	}

	// Trim array to actual count if needed
	if (matricesCount < matrices.length) {
		matrices.length = matricesCount
	}

	return matrices
}

/**
 * Generate vegetation matrices for a terrain tile.
 *
 * Iterates over all minimum-size cells within the tile bounds and
 * collects vegetation from each cell. This ensures positions are
 * stable regardless of tile LOD.
 *
 * @param {Object} node - Quadtree node (tile) with centerX, centerZ, size
 * @param {Object} terrainHelpers - Terrain height/normal sampling functions
 * @param {number} lodLevel - LOD level (unused, kept for API compatibility)
 * @param {Object} vegetationTypeConfig - Configuration for this vegetation type
 * @param {number} typeIndex - Index of this vegetation type (used for seeding)
 * @returns {Array} Array of vegetation matrices
 */
export const generateVegetationForType = (node, terrainHelpers, lodLevel, vegetationTypeConfig, typeIndex) => {
	const { centerX, centerZ, size } = node
	const matrices = []

	// Calculate tile bounds
	const halfSize = size / 2
	const minX = centerX - halfSize
	const minZ = centerZ - halfSize

	// Calculate how many cells this tile contains
	const cellsPerSide = Math.round(size / QUADTREE_MIN_SIZE)

	// Iterate over all cells in this tile
	for (let cx = 0; cx < cellsPerSide; cx++) {
		for (let cz = 0; cz < cellsPerSide; cz++) {
			// Calculate cell center (aligned to QUADTREE_MIN_SIZE grid)
			const cellX = minX + (cx + 0.5) * QUADTREE_MIN_SIZE
			const cellZ = minZ + (cz + 0.5) * QUADTREE_MIN_SIZE

			// Generate vegetation for this cell and add to matrices
			const cellMatrices = generateCellVegetation(cellX, cellZ, terrainHelpers, vegetationTypeConfig, typeIndex)

			// Concat arrays more efficiently than spread operator
			for (let i = 0; i < cellMatrices.length; i++) {
				matrices.push(cellMatrices[i])
			}
		}
	}

	return matrices
}
