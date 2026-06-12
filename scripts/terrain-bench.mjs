// Terrain/vegetation performance benchmark — exercises the REAL production
// code path (quadtree update → edge stitching → tile array build → vegetation
// placement) headlessly and reports quantitative costs:
//   - initial load: tile count, per-LOD build cost, vegetation cost
//   - movement: per-update rebuild cost while driving (≈ main-thread hitch)
//   - determinism: a height checksum that must stay identical across
//     refactors that claim to be behavior-preserving
// Run: node scripts/run-terrain-sanity.mjs scripts/terrain-bench.mjs

import { createTerrainHelpers } from '../utils/terrain/heightSampler.js'
import { buildTileArrays } from '../utils/terrain/tileGeometryBuilder.js'
import { QuadtreeNode, getEdgeStitchInfo } from '../utils/terrain/quadtree.js'
import { collectDesiredChunks, buildVegetationChunkArrays } from '../utils/vegetation/vegetationChunks.js'
import VEGETATION_CONFIG from '../config/vegetation.js'
import {
	QUADTREE_ROOT_SIZE,
	QUADTREE_MIN_SIZE,
	LOD_SPLIT_FACTOR,
	LOD_HYSTERESIS,
	MAX_QUADTREE_DEPTH,
	QUADTREE_VIEW_RANGE,
} from '../config/lod.js'

const now = () => performance.now()
const fmt = (ms) => (ms >= 100 ? ms.toFixed(0) : ms.toFixed(1)) + 'ms'

// ---------------------------------------------------------------------------
// Quadtree simulation — mirrors hooks/useTerrainQuadtree.js exactly.
// ---------------------------------------------------------------------------
const quadtreeRoots = new Map()

const updateQuadtree = (camX, camZ, vehX, vehZ) => {
	const rootsNeeded = new Set()
	const centerRootX = Math.floor(camX / QUADTREE_ROOT_SIZE)
	const centerRootZ = Math.floor(camZ / QUADTREE_ROOT_SIZE)

	for (let rx = -QUADTREE_VIEW_RANGE; rx <= QUADTREE_VIEW_RANGE; rx++) {
		for (let rz = -QUADTREE_VIEW_RANGE; rz <= QUADTREE_VIEW_RANGE; rz++) {
			if (rx * rx + rz * rz > QUADTREE_VIEW_RANGE * QUADTREE_VIEW_RANGE) continue
			const rootX = (centerRootX + rx) * QUADTREE_ROOT_SIZE + QUADTREE_ROOT_SIZE / 2
			const rootZ = (centerRootZ + rz) * QUADTREE_ROOT_SIZE + QUADTREE_ROOT_SIZE / 2
			const rootKey = `${rootX},${rootZ}`
			rootsNeeded.add(rootKey)
			if (!quadtreeRoots.has(rootKey)) {
				quadtreeRoots.set(rootKey, new QuadtreeNode(rootX, rootZ, QUADTREE_ROOT_SIZE, MAX_QUADTREE_DEPTH))
			}
		}
	}

	for (const [key] of quadtreeRoots) {
		if (!rootsNeeded.has(key)) quadtreeRoots.delete(key)
	}

	for (const [, root] of quadtreeRoots) {
		root.update(camX, camZ, LOD_SPLIT_FACTOR, LOD_HYSTERESIS, QUADTREE_MIN_SIZE, vehX, vehZ)
	}

	const allLeaves = []
	const allNodes = new Map()
	for (const [, root] of quadtreeRoots) {
		root.collectLeaves(allLeaves, allNodes)
	}

	return allLeaves.map((node) => ({
		node,
		edgeStitchInfo: getEdgeStitchInfo(node, allNodes, QUADTREE_MIN_SIZE),
	}))
}

const stitchSig = (e) =>
	`${e.north.needsStitch ? e.north.neighborStep : 0}|${e.south.needsStitch ? e.south.neighborStep : 0}|` +
	`${e.east.needsStitch ? e.east.neighborStep : 0}|${e.west.needsStitch ? e.west.neighborStep : 0}`

// ---------------------------------------------------------------------------
// Vegetation desired-chunk set — mirrors VegetationSystem.jsx (camera rings +
// collider zone around the vehicle).
// ---------------------------------------------------------------------------
const COLLIDER_DISTANCE = 128
const collectAllDesiredVegChunks = (camX, camZ, vehX, vehZ) => {
	const desired = new Map()
	VEGETATION_CONFIG.forEach((config, typeIndex) => {
		const list = []
		collectDesiredChunks(typeIndex, config, camX, camZ, list)
		if (config.collider) collectDesiredChunks(typeIndex, config, vehX, vehZ, list, COLLIDER_DISTANCE)
		for (const desc of list) {
			if (!desired.has(desc.key)) desired.set(desc.key, desc)
		}
	})
	return desired
}

// ---------------------------------------------------------------------------
// FNV-1a checksums over tile heights (order-stabilized by tile key), one per
// tile size — guards against unintended terrain changes across refactors.
// The 32m (physics) checksum must NEVER change; coarser sizes may change only
// when band-limiting thresholds are deliberately adjusted.
// ---------------------------------------------------------------------------
const checksums = new Map()
const addToChecksum = (size, heightCache) => {
	let checksum = checksums.get(size) ?? 2166136261
	for (let i = 0; i < heightCache.length; i++) {
		// quantize to mm to be robust against benign fp formatting differences
		let v = Math.round(heightCache[i] * 1000) | 0
		checksum ^= v & 0xff
		checksum = Math.imul(checksum, 16777619)
		checksum ^= (v >> 8) & 0xff
		checksum = Math.imul(checksum, 16777619)
		checksum ^= (v >> 16) & 0xff
		checksum = Math.imul(checksum, 16777619)
	}
	checksums.set(size, checksum)
}

// ===========================================================================
console.log('=== terrain-bench ===')
console.log(`view range ${QUADTREE_VIEW_RANGE} roots of ${QUADTREE_ROOT_SIZE}m, min tile ${QUADTREE_MIN_SIZE}m`)

const tHelpers0 = now()
const helpers = createTerrainHelpers()
console.log(`createTerrainHelpers (incl. road routing): ${fmt(now() - tHelpers0)}`)

// --- Initial load -----------------------------------------------------------
const tQt0 = now()
let tiles = updateQuadtree(0, 0, 0, 0)
const qtMs = now() - tQt0

// Build all tiles, bucketed by size
const sizeBuckets = new Map()
const builtArrays = new Map() // key+sig -> arrays (kept like the app's geometry cache would)
const tBuild0 = now()
for (const { node, edgeStitchInfo } of tiles) {
	const t0 = now()
	const arrays = buildTileArrays(node, helpers, edgeStitchInfo)
	const ms = now() - t0
	builtArrays.set(node.key + '#' + stitchSig(edgeStitchInfo), arrays)
	let bucket = sizeBuckets.get(node.size)
	if (!bucket) sizeBuckets.set(node.size, (bucket = { count: 0, ms: 0 }))
	bucket.count++
	bucket.ms += ms
}
const buildMs = now() - tBuild0

// checksums in stable order
const tileSizeByKey = new Map()
for (const { node, edgeStitchInfo } of tiles) tileSizeByKey.set(node.key + '#' + stitchSig(edgeStitchInfo), node.size)
const sortedKeys = [...builtArrays.keys()].sort()
for (const k of sortedKeys) addToChecksum(tileSizeByKey.get(k), builtArrays.get(k).heightCache)

console.log(`\n--- initial load (camera & vehicle at spawn) ---`)
console.log(`quadtree update + stitch info: ${fmt(qtMs)} for ${tiles.length} leaf tiles`)
console.log(`tile geometry build: ${fmt(buildMs)} total`)
for (const [size, b] of [...sizeBuckets.entries()].sort((a, c) => a[0] - c[0])) {
	console.log(`  size ${String(size).padStart(4)}m: ${String(b.count).padStart(3)} tiles, ${fmt(b.ms)} (${(b.ms / b.count).toFixed(2)}ms/tile)`)
}
console.log(
	'height checksums: ' +
		[...checksums.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([size, c]) => `${size}m=${(c >>> 0).toString(16)}`)
			.join(' ')
)

// --- Vegetation initial load -------------------------------------------------
const SKIP_VEG = process.env.SKIP_VEG === '1'
const vegStats = VEGETATION_CONFIG.map((c) => ({ name: c.name, ms: 0, chunks: 0, instances: 0 }))
let instancedMeshCount = 0
let vegChunkKeys = new Set()
const tVeg0 = now()
if (!SKIP_VEG) {
	const desired = collectAllDesiredVegChunks(0, 0, 0, 0)
	vegChunkKeys = new Set(desired.keys())
	for (const desc of desired.values()) {
		const t0 = now()
		const result = buildVegetationChunkArrays(desc.chunkX, desc.chunkZ, desc.chunkSize, VEGETATION_CONFIG[desc.typeIndex], desc.typeIndex, helpers)
		const stats = vegStats[desc.typeIndex]
		stats.ms += now() - t0
		stats.chunks++
		stats.instances += result.count
		if (result.count > 0) instancedMeshCount++
	}
}
const vegMs = now() - tVeg0
console.log(`\nvegetation generation: ${fmt(vegMs)} total, ~${instancedMeshCount} InstancedMeshes (draw calls)`)
for (const s of vegStats) {
	if (s.chunks === 0) continue
	console.log(`  ${s.name.padEnd(14)} ${fmt(s.ms).padStart(8)} over ${String(s.chunks).padStart(3)} chunks, ${s.instances} instances`)
}
console.log(`TOTAL initial CPU (quadtree + tiles + vegetation): ${fmt(qtMs + buildMs + vegMs)}`)

// --- Movement simulation ------------------------------------------------------
// Drive north at 14 m/s (~50 km/h) for 120 simulated seconds. The app updates
// the quadtree at most every 100ms and only after ≥32m of movement, so we step
// in 100ms ticks and trigger updates exactly like useTerrainQuadtree does.
console.log(`\n--- movement: 120s drive at 14 m/s (50 km/h) ---`)
const SPEED = 14
let lastUpdate = { x: 0, z: 0 }
let prevKeys = new Set(builtArrays.keys())
const events = []
let vegEventMs = 0

for (let t = 0.1; t <= 120; t += 0.1) {
	const z = SPEED * t
	const dz = z - lastUpdate.z
	if (Math.sqrt(dz * dz) < QUADTREE_MIN_SIZE) continue
	lastUpdate = { x: 0, z }

	const t0 = now()
	tiles = updateQuadtree(0, z, 0, z)
	const qtTime = now() - t0

	// Build only tiles whose (key, stitchSig) is new — mirrors the geometry
	// cache in the tile streaming layer.
	let built = 0
	let buildTime = 0
	const currentKeys = new Set()
	for (const { node, edgeStitchInfo } of tiles) {
		const cacheKey = node.key + '#' + stitchSig(edgeStitchInfo)
		currentKeys.add(cacheKey)
		if (prevKeys.has(cacheKey)) continue
		const b0 = now()
		buildTileArrays(node, helpers, edgeStitchInfo)
		buildTime += now() - b0
		built++
	}
	prevKeys = currentKeys

	// Vegetation chunk churn — only chunks entering their ring get built
	let vegTime = 0
	let vegBuilt = 0
	if (!SKIP_VEG) {
		const desired = collectAllDesiredVegChunks(0, z, 0, z)
		for (const desc of desired.values()) {
			if (vegChunkKeys.has(desc.key)) continue
			const v0 = now()
			buildVegetationChunkArrays(desc.chunkX, desc.chunkZ, desc.chunkSize, VEGETATION_CONFIG[desc.typeIndex], desc.typeIndex, helpers)
			vegTime += now() - v0
			vegBuilt++
		}
		vegChunkKeys = new Set(desired.keys())
	}
	vegEventMs += vegTime
	events.push({ t, qtTime, buildTime, vegTime, built, vegBuilt, total: qtTime + buildTime + vegTime })
}

if (events.length) {
	const totals = events.map((e) => e.total).sort((a, b) => a - b)
	const sum = totals.reduce((a, b) => a + b, 0)
	const avg = sum / totals.length
	const p95 = totals[Math.floor(totals.length * 0.95)]
	const max = totals[totals.length - 1]
	const tilesBuilt = events.reduce((a, e) => a + e.built, 0)
	console.log(`${events.length} quadtree updates, ${tilesBuilt} tile builds, total rebuild CPU ${fmt(sum)} (veg ${fmt(vegEventMs)})`)
	console.log(`per-update cost (≈ main-thread hitch): avg ${fmt(avg)}, p95 ${fmt(p95)}, max ${fmt(max)}`)
}

// --- Steady-state sample cache hit cost ---------------------------------------
{
	const N = 200000
	const t0 = now()
	let acc = 0
	for (let i = 0; i < N; i++) {
		acc += helpers.getHeight((i % 17) * 2, ((i / 17) | 0) % 17 * 2)
	}
	const ms = now() - t0
	console.log(`\ncache-hit getHeight: ${((ms * 1e6) / N).toFixed(0)}ns/call (acc ${acc.toFixed(0)})`)
}

const mem = process.memoryUsage()
console.log(`heap used: ${(mem.heapUsed / 1048576).toFixed(0)}MB`)
