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

// Cell area is constant — QUADTREE_MIN_SIZE² in square meters
const _cellArea = QUADTREE_MIN_SIZE * QUADTREE_MIN_SIZE

/**
 * Cell result cache.
 * Key: `${gridX},${gridZ},${typeIndex}`
 * Value: Matrix4[] — the exact array returned by generateCellVegetation.
 *
 * Cells are purely deterministic (same seed → same terrain → same output), so
 * a cached result is always valid for the lifetime of a terrain noise instance.
 * Call clearVegetationCache() whenever the noise / terrain config changes.
 */
const _cellCache = new Map()

/**
 * Evict all cached cell results.
 * Must be called when terrain noise or vegetation config changes.
 */
export const clearVegetationCache = () => _cellCache.clear()

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
	const gridX = Math.floor(cellX / QUADTREE_MIN_SIZE)
	const gridZ = Math.floor(cellZ / QUADTREE_MIN_SIZE)

	const cacheKey = `${gridX},${gridZ},${typeIndex}`
	const cached = _cellCache.get(cacheKey)
	if (cached) return cached

	const { getHeight, getNormal } = terrainHelpers
	const { scale, slope, height, density } = config

	const halfCell = QUADTREE_MIN_SIZE / 2
	const minX = cellX - halfCell
	const minZ = cellZ - halfCell

	const cellSeed = hashCoords(gridX, gridZ, 88888 + typeIndex * 1000)
	const random = createSeededRandom(cellSeed)

	const slopeMinNormalY = 1 - slope.max
	const slopeMaxNormalY = 1 - slope.min

	// density = items per km² → scale to cell area, then add ±20% natural variation
	const expectedCount = (density || 1.0) * (_cellArea / 1_000_000)
	const targetCount = expectedCount * (0.8 + random() * 0.4)
	let count = Math.floor(targetCount)
	if (random() < targetCount - count) count++

	const matrices = []

	for (let attempts = 0; matrices.length < count && attempts < count * 10; attempts++) {
		const vegX = minX + random() * QUADTREE_MIN_SIZE
		const vegZ = minZ + random() * QUADTREE_MIN_SIZE

		const vegY = getHeight(vegX, vegZ)
		if (vegY < height.min || vegY > height.max) continue

		const normal = getNormal(vegX, vegZ, _normalScratch)
		if (normal.y < slopeMinNormalY || normal.y > slopeMaxNormalY) continue

		_scratchDummy.position.set(vegX, vegY, vegZ)
		_scratchDummy.rotation.set(0, random() * Math.PI * 2, 0)
		_scratchDummy.scale.setScalar(scale.min + random() * (scale.max - scale.min))
		_scratchDummy.updateMatrix()
		matrices.push(_scratchDummy.matrix.clone())
	}

	_cellCache.set(cacheKey, matrices)
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
 * @param {Object} vegetationTypeConfig - Configuration for this vegetation type
 * @param {number} typeIndex - Index of this vegetation type (used for seeding)
 * @returns {Array} Array of vegetation matrices
 */
export const generateVegetationForType = (node, terrainHelpers, vegetationTypeConfig, typeIndex) => {
	const { centerX, centerZ, size } = node
	const matrices = []

	// Calculate tile bounds
	const halfSize = size / 2
	const minX = centerX - halfSize
	const minZ = centerZ - halfSize

	// Calculate how many cells this tile contains
	const cellsPerSide = Math.round(size / QUADTREE_MIN_SIZE)

	for (let cx = 0; cx < cellsPerSide; cx++) {
		for (let cz = 0; cz < cellsPerSide; cz++) {
			const cellX = minX + (cx + 0.5) * QUADTREE_MIN_SIZE
			const cellZ = minZ + (cz + 0.5) * QUADTREE_MIN_SIZE
			const cellMatrices = generateCellVegetation(cellX, cellZ, terrainHelpers, vegetationTypeConfig, typeIndex)
			for (let i = 0; i < cellMatrices.length; i++) matrices.push(cellMatrices[i])
		}
	}

	return matrices
}
