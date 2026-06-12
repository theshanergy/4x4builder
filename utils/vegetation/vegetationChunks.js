// Vegetation chunk system — distance-ring streamed, decoupled from terrain LOD.
//
// The world is divided into fixed 32 m placement cells (QUADTREE_MIN_SIZE).
// Each cell deterministically seeds its own instances, so placements are
// identical no matter which chunk/ring/LOD requests them — and identical to
// the legacy per-terrain-tile system within its draw range.
//
// Chunks group cells for rendering: one InstancedMesh per (type, chunk).
// Ring membership (near = detailed mesh + shadows, far = simple mesh) is a
// pure function of chunk-center distance to the camera, so terrain LOD
// changes never touch vegetation.
//
// This module is three.js-free and runs inside the generation workers.

import { QUADTREE_MIN_SIZE } from '../../config/lod'
import { createSeededRandom, hashCoords } from '../seededRandom'

export const VEG_NEAR_CHUNK_SIZE = 128
export const VEG_MID_CHUNK_SIZE = 256
export const VEG_FAR_CHUNK_SIZE = 512

const smoothstep = (edge0, edge1, x) => {
	const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
	return t * t * (3 - 2 * t)
}

// Duck-typed Vector3 stand-in so getNormal can write into it without
// importing three (keeps the worker bundle lean).
const _normalScratch = {
	x: 0,
	y: 0,
	z: 0,
	set(x, y, z) {
		this.x = x
		this.y = y
		this.z = z
		return this
	},
}

/**
 * Climate suitability in [0,1] for a vegetation type at a sampled climate.
 * Conditions (min/max with a smooth transition band) multiply, so types fade
 * out gradually toward biome borders instead of stopping at a hard line.
 */
export const climateSuitability = (climate, climateConfig) => {
	if (!climateConfig || !climate) return 1

	let suitability = 1
	for (const field of ['moisture', 'continental', 'mountain']) {
		const cond = climateConfig[field]
		if (!cond) continue
		const value = climate[field]
		const transition = cond.transition ?? 0.05
		if (cond.min !== undefined) {
			suitability *= smoothstep(cond.min - transition, cond.min + transition, value)
		}
		if (cond.max !== undefined) {
			suitability *= 1 - smoothstep(cond.max - transition, cond.max + transition, value)
		}
		if (suitability <= 0) return 0
	}

	return suitability
}

/**
 * Rendering rings for a vegetation type, derived from its config:
 * - `drawDistance` (m): hard streaming cutoff.
 * - `nearDistance` (m, optional): within it use the detailed mesh (lod 0) and
 *   cast shadows; beyond it use the simplified mesh (lod 2), no shadows.
 */
export const getRingsForType = (config) => {
	const drawDistance = config.drawDistance ?? 250
	if (config.nearDistance && config.nearDistance < drawDistance) {
		return [
			{ minDist: 0, maxDist: config.nearDistance, chunkSize: VEG_NEAR_CHUNK_SIZE, lodKey: 0, castShadow: true },
			{ minDist: config.nearDistance, maxDist: drawDistance, chunkSize: VEG_FAR_CHUNK_SIZE, lodKey: 2, castShadow: false },
		]
	}
	const chunkSize = drawDistance <= 400 ? VEG_NEAR_CHUNK_SIZE : VEG_MID_CHUNK_SIZE
	return [{ minDist: 0, maxDist: drawDistance, chunkSize, lodKey: 0, castShadow: true }]
}

/**
 * Collect the desired chunk descriptors for one type around a center point.
 * Pure function of (config, center) — re-evaluated when the camera moves.
 *
 * @param {number} maxDistOverride - optional cap (e.g. collider-only streaming
 *   around the vehicle passes a small radius and ring 0 only)
 */
export const collectDesiredChunks = (typeIndex, config, centerX, centerZ, out, maxDistOverride = Infinity) => {
	const rings = getRingsForType(config)
	for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
		const ring = rings[ringIndex]
		const maxDist = Math.min(ring.maxDist, maxDistOverride)
		if (maxDist <= ring.minDist && ringIndex > 0) continue
		const chunkSize = ring.chunkSize
		const minGx = Math.floor((centerX - maxDist) / chunkSize)
		const maxGx = Math.floor((centerX + maxDist) / chunkSize)
		const minGz = Math.floor((centerZ - maxDist) / chunkSize)
		const maxGz = Math.floor((centerZ + maxDist) / chunkSize)

		for (let gx = minGx; gx <= maxGx; gx++) {
			for (let gz = minGz; gz <= maxGz; gz++) {
				const chunkX = (gx + 0.5) * chunkSize
				const chunkZ = (gz + 0.5) * chunkSize
				const dx = chunkX - centerX
				const dz = chunkZ - centerZ
				const dist = Math.sqrt(dx * dx + dz * dz)
				if (dist < ring.minDist || dist >= maxDist) continue
				out.push({
					key: `veg:${typeIndex}:${ringIndex}:${gx}:${gz}`,
					typeIndex,
					ringIndex,
					lodKey: ring.lodKey,
					castShadow: ring.castShadow,
					chunkX,
					chunkZ,
					chunkSize,
					distSq: dx * dx + dz * dz,
				})
			}
		}
	}
	return out
}

/**
 * Generate instances for a single 32 m cell, appending [x, y, z, rotY, scale]
 * tuples to `instances`. Deterministic from (cell grid coords, typeIndex) —
 * the RNG call sequence matches the legacy per-tile generator exactly so
 * existing placements are preserved.
 */
const appendCellInstances = (cellMinX, cellMinZ, gridX, gridZ, config, typeIndex, terrainHelpers, instances) => {
	const { getHeight, getNormal } = terrainHelpers
	const { scale, slope, height, density } = config

	const cellCenterX = cellMinX + QUADTREE_MIN_SIZE / 2
	const cellCenterZ = cellMinZ + QUADTREE_MIN_SIZE / 2

	const cellSeed = hashCoords(gridX, gridZ, 88888 + typeIndex * 1000)
	const random = createSeededRandom(cellSeed)

	const slopeMinNormalY = 1 - slope.max
	const slopeMaxNormalY = 1 - slope.min

	// Climate gate — one band-limited (cheap) sample at the cell center scales
	// the expected count, so cells deep inside the wrong biome bail out before
	// placement attempts. Climate fields are identical across bands; the
	// banded height is within a few meters of exact, far inside the ±30 slack.
	const cellSample = terrainHelpers.sample?.(cellCenterX, cellCenterZ, QUADTREE_MIN_SIZE)
	const cellSuitability = climateSuitability(cellSample?.climate, config.climate)
	if (cellSuitability < 0.02) return
	if (cellSample && (cellSample.height < height.min - 30 || cellSample.height > height.max + 30)) return

	// density = items per square kilometer (1,000,000 sq m)
	const cellArea = QUADTREE_MIN_SIZE * QUADTREE_MIN_SIZE
	const expectedCount = (density || 1.0) * (cellArea / 1000000) * cellSuitability

	// Natural variation (±20%), then probabilistic rounding (Poisson-ish)
	const targetCount = expectedCount * (0.8 + random() * 0.4)
	let count = Math.floor(targetCount)
	if (random() < targetCount - count) count++
	if (count === 0) return

	const maxAttempts = count * 10
	let attempts = 0
	let placed = 0

	while (placed < count && attempts < maxAttempts) {
		attempts++

		const vegX = cellMinX + random() * QUADTREE_MIN_SIZE
		const vegZ = cellMinZ + random() * QUADTREE_MIN_SIZE

		// Exact (band 0) sample for placement: instances must sit on the
		// physics-grade surface.
		const instanceSample = terrainHelpers.sample?.(vegX, vegZ)
		if (instanceSample?.surface?.vegetationClearance > 0.05) continue

		const vegY = instanceSample?.height ?? getHeight(vegX, vegZ)
		if (vegY < height.min || vegY > height.max) continue

		const normal = getNormal(vegX, vegZ, _normalScratch)
		if (normal.y < slopeMinNormalY || normal.y > slopeMaxNormalY) continue

		// Per-instance climate check — smooth probabilistic falloff toward
		// biome borders (deterministic via the cell-seeded random stream)
		if (config.climate) {
			const suitability = climateSuitability(instanceSample?.climate, config.climate)
			if (suitability < 0.02) continue
			if (suitability < 1 && random() > suitability) continue
		}

		const vegScale = scale.min + random() * (scale.max - scale.min)
		const rotY = random() * Math.PI * 2

		instances.push(vegX, vegY, vegZ, rotY, vegScale)
		placed++
	}
}

/**
 * Build the instance data for one vegetation chunk.
 *
 * @returns {{
 *   matrices: Float32Array,   // count × 16, three.js column-major layout
 *   count: number,
 *   minY: number, maxY: number, // for frustum-culling bounds
 *   colliders: Float32Array|null // count × 4: x, y, z, scale (when config.collider)
 * }}
 */
export const buildVegetationChunkArrays = (chunkX, chunkZ, chunkSize, config, typeIndex, terrainHelpers) => {
	const cellsPerSide = Math.round(chunkSize / QUADTREE_MIN_SIZE)
	const minX = chunkX - chunkSize / 2
	const minZ = chunkZ - chunkSize / 2

	const instances = [] // flat [x, y, z, rotY, scale] tuples

	for (let cx = 0; cx < cellsPerSide; cx++) {
		for (let cz = 0; cz < cellsPerSide; cz++) {
			const cellMinX = minX + cx * QUADTREE_MIN_SIZE
			const cellMinZ = minZ + cz * QUADTREE_MIN_SIZE
			// Chunks are aligned to multiples of QUADTREE_MIN_SIZE, so the cell
			// grid coords (and therefore seeds) are chunking-independent.
			const gridX = Math.round(cellMinX / QUADTREE_MIN_SIZE)
			const gridZ = Math.round(cellMinZ / QUADTREE_MIN_SIZE)
			appendCellInstances(cellMinX, cellMinZ, gridX, gridZ, config, typeIndex, terrainHelpers, instances)
		}
	}

	const count = instances.length / 5
	const matrices = new Float32Array(count * 16)
	const colliders = config.collider ? new Float32Array(count * 4) : null
	let minY = Infinity
	let maxY = -Infinity

	for (let i = 0; i < count; i++) {
		const src = i * 5
		const x = instances[src]
		const y = instances[src + 1]
		const z = instances[src + 2]
		const rotY = instances[src + 3]
		const s = instances[src + 4]

		const c = Math.cos(rotY) * s
		const sn = Math.sin(rotY) * s

		// Column-major TRS (rotation about Y, uniform scale) — matches
		// Matrix4.compose(position, quaternionFromY(rotY), scale)
		const base = i * 16
		matrices[base] = c
		matrices[base + 2] = -sn
		matrices[base + 5] = s
		matrices[base + 8] = sn
		matrices[base + 10] = c
		matrices[base + 12] = x
		matrices[base + 13] = y
		matrices[base + 14] = z
		matrices[base + 15] = 1

		if (colliders) {
			const cBase = i * 4
			colliders[cBase] = x
			colliders[cBase + 1] = y
			colliders[cBase + 2] = z
			colliders[cBase + 3] = s
		}

		if (y < minY) minY = y
		if (y > maxY) maxY = y
	}

	if (count === 0) {
		minY = 0
		maxY = 0
	}

	return { matrices, count, minY, maxY, colliders }
}
