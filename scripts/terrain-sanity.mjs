// Terrain sanity check — samples the procedural world headlessly and reports
// determinism, biome distribution, spawn conditions, and per-sample cost.
// Run: node scripts/terrain-sanity.mjs

import { createTerrainHelpers } from '../utils/terrain/heightSampler.js'
import WATER_CONFIG from '../config/water.js'

const helpers = createTerrainHelpers()

// --- Determinism: two independent instances must agree exactly ---
const helpers2 = createTerrainHelpers()
let maxDelta = 0
for (let i = 0; i < 500; i++) {
	const x = (Math.sin(i * 12.34) * 0.5 + 0.5) * 40000 - 20000
	const z = (Math.sin(i * 56.78) * 0.5 + 0.5) * 40000 - 20000
	maxDelta = Math.max(maxDelta, Math.abs(helpers.getHeight(x, z) - helpers2.getHeight(x, z)))
}
console.log(`determinism: max height delta across instances = ${maxDelta}`)

// --- World statistics over a wide grid ---
const EXTENT = 30000
const STEPS = 120
let minH = Infinity
let maxH = -Infinity
let water = 0
let beach = 0
let arid = 0
let moist = 0
let snow = 0
let mountainous = 0
let total = 0
let maxHX = 0
let maxHZ = 0

for (let i = 0; i <= STEPS; i++) {
	for (let j = 0; j <= STEPS; j++) {
		const x = -EXTENT + (2 * EXTENT * i) / STEPS
		const z = -EXTENT + (2 * EXTENT * j) / STEPS
		const s = helpers.sample(x, z)
		total++
		if (s.height < minH) minH = s.height
		if (s.height > maxH) {
			maxH = s.height
			maxHX = x
			maxHZ = z
		}
		if (s.height < WATER_CONFIG.level) water++
		else if (s.height < 5) beach++
		if (s.height > 240) snow++
		if (s.climate.mountain > 0.15) mountainous++
		if (s.height >= WATER_CONFIG.level) {
			if (s.climate.moisture < 0.42) arid++
			else moist++
		}
	}
}

const pct = (n) => ((100 * n) / total).toFixed(1) + '%'
console.log(`heights: min=${minH.toFixed(1)}m max=${maxH.toFixed(1)}m (peak at ${maxHX.toFixed(0)},${maxHZ.toFixed(0)})`)
console.log(`coverage: water=${pct(water)} nearShore=${pct(beach)} snowAltitude=${pct(snow)} mountainRelief=${pct(mountainous)}`)
console.log(`land split: arid=${pct(arid)} moist=${pct(moist)}`)

// --- Spawn area ---
const s0 = helpers.sample(0, 0)
console.log(`spawn: height=${s0.height.toFixed(2)}m climate c=${s0.climate.continental.toFixed(3)} m=${s0.climate.moisture.toFixed(3)} mountain=${s0.climate.mountain.toFixed(3)}`)
let oceanDist = null
for (let d = 500; d <= 30000; d += 250) {
	let found = false
	for (let a = 0; a < 16; a++) {
		const x = Math.cos((a * Math.PI) / 8) * d
		const z = Math.sin((a * Math.PI) / 8) * d
		if (helpers.getHeight(x, z) < WATER_CONFIG.level) {
			found = true
			break
		}
	}
	if (found) {
		oceanDist = d
		break
	}
}
console.log(`nearest ocean from spawn: ${oceanDist === null ? '> 30km (!)' : '~' + oceanDist + 'm'}`)

// Nearest snow peak from spawn
let snowDist = null
for (let d = 1000; d <= 40000; d += 500) {
	for (let a = 0; a < 24; a++) {
		const x = Math.cos((a * Math.PI) / 12) * d
		const z = Math.sin((a * Math.PI) / 12) * d
		if (helpers.getHeight(x, z) > 240) {
			snowDist = d
			break
		}
	}
	if (snowDist) break
}
console.log(`nearest snow-altitude terrain from spawn: ${snowDist === null ? '> 40km' : '~' + snowDist + 'm'}`)

// --- Normals consistency: analytic vs finite differences (off-road) ---
let worstNormalErr = 0
for (let i = 0; i < 200; i++) {
	const x = 4000 + Math.sin(i * 3.1) * 8000
	const z = 4000 + Math.cos(i * 1.7) * 8000
	const s = helpers.sample(x, z)
	if (s.surface?.heightInfluence > 0.001) continue
	const eps = 0.5
	const dhdx = (helpers.getHeight(x + eps, z) - helpers.getHeight(x - eps, z)) / (2 * eps)
	const dhdz = (helpers.getHeight(x, z + eps) - helpers.getHeight(x, z - eps)) / (2 * eps)
	worstNormalErr = Math.max(worstNormalErr, Math.abs(dhdx - s.slopeX), Math.abs(dhdz - s.slopeZ))
}
console.log(`analytic vs finite-diff slope: worst delta = ${worstNormalErr.toFixed(4)} (m/m)`)

// --- LOD band accuracy: banded vs exact heights at each tile step ---
// Reported error should stay well below what the coarse vertex grid itself
// already loses to undersampling (≈ the dropped octaves' amplitude).
console.log('band accuracy (banded height vs exact, 2k samples across inland+mountains):')
for (const step of [4, 8, 16, 32, 64, 128, 256]) {
	let sumSq = 0
	let maxAbs = 0
	let n = 0
	for (let i = 0; i < 2000; i++) {
		// deterministic scatter over a 24km inland box (includes mountains)
		const x = 2000 + (Math.sin(i * 127.1) * 0.5 + 0.5) * 24000
		const z = 2000 + (Math.sin(i * 311.7) * 0.5 + 0.5) * 24000
		// snap to the band's grid like a real tile vertex
		const gx = Math.round(x / step) * step
		const gz = Math.round(z / step) * step
		const exact = helpers.getHeight(gx, gz)
		const banded = helpers.getHeight(gx, gz, step)
		const d = banded - exact
		sumSq += d * d
		if (Math.abs(d) > maxAbs) maxAbs = Math.abs(d)
		n++
	}
	console.log(`  step ${String(step).padStart(3)}m (tiles ${String(step * 16).padStart(4)}m): rms=${Math.sqrt(sumSq / n).toFixed(2)}m max=${maxAbs.toFixed(2)}m`)
}

// --- Performance: fresh-sample cost on land vs ocean ---
const timeSamples = (cx, cz, label) => {
	const N = 5000
	const start = performance.now()
	for (let i = 0; i < N; i++) {
		// Unique coords each call to defeat the LRU cache
		helpers.sample(cx + (i % 100) * 1.37, cz + Math.floor(i / 100) * 1.91)
	}
	const ms = performance.now() - start
	console.log(`perf ${label}: ${((ms * 1000) / N).toFixed(1)}µs/sample (${N} fresh samples in ${ms.toFixed(0)}ms)`)
}
timeSamples(6000, 6000, 'inland')
// Find genuinely deep water for the ocean perf probe
let deepX = null
let deepZ = null
outer: for (let x = -EXTENT; x <= EXTENT; x += 1000) {
	for (let z = -EXTENT; z <= EXTENT; z += 1000) {
		if (helpers.getHeight(x, z) < -20) {
			deepX = x
			deepZ = z
			break outer
		}
	}
}
if (deepX !== null) timeSamples(deepX, deepZ, `ocean (${deepX},${deepZ})`)
