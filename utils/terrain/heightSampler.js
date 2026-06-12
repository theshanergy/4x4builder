// Terrain Height Sampler — climate-driven infinite biome terrain.
//
// Pipeline per sample (all deterministic from TERRAIN_CONFIG.seed, all with
// analytic derivatives so normals/physics/vegetation agree exactly):
//   1. Climate fields (continentalness / moisture / mountainness) — see climate.js
//   2. Base elevation spline over continentalness (ocean floor → shore → inland)
//   3. Rolling-hills fractal noise (faded out across the shoreline)
//   4. Ridged-fractal mountains, gated to inland high-mountainness regions
//   5. Phacelle-noise erosion over the combined surface (gullies follow the
//      real slope, so mountains erode like mountains), suppressed near
//      shorelines and skipped entirely underwater
//   6. Spawn flattening and spline road corridors
//
// Drives the visual mesh, the physics heightfields, material climate
// attributes, and vegetation placement.

import { Vector3 } from 'three'

import TERRAIN_CONFIG from '../../config/terrain'
import WATER_CONFIG from '../../config/water'
import { createNoise, fractalNoise, ridgedFractalNoise, smoothstepD } from './noise'
import { createClimateSampler, evaluateElevationSpline } from './climate'
import { createSplineCorridorSystem } from './splineCorridors'

// -------------------------------------------------------------------------
// Phacelle noise (port of shader `PhacelleNoise`). Returns four scalars:
//   (interpolated.x, interpolated.y, sideDir.x, sideDir.y)
// where `interpolated` is the aggregated wave vector and `sideDir` is the
// perpendicular-to-slope direction used to drive gully orientation.
// -------------------------------------------------------------------------
const TAU = Math.PI * 2

// exp(-d²·2) ≤ 0.01111 ⟺ d² ≥ ln(1/0.01111)/2 — beyond this the clamped
// phacelle cell weight is exactly 0, so cos/sin/exp can be skipped with no
// change in output. Roughly half the 4×4 cells qualify.
const ZERO_WEIGHT_DIST_SQ = Math.log(1 / 0.01111) / 2

const phacelleNoise = (noise, px, py, normDirX, normDirY, freq, offset, normalization, out, tmpHash) => {
	// sideDir = normDir.yx * vec2(-1,1) * freq * TAU
	const sideDirX = -normDirY * freq * TAU
	const sideDirY = normDirX * freq * TAU
	const offsetTau = offset * TAU

	const pIntX = Math.floor(px)
	const pIntY = Math.floor(py)
	const pFracX = px - pIntX
	const pFracY = py - pIntY

	let phaseDirX = 0
	let phaseDirY = 0
	let weightSum = 0

	for (let i = -1; i <= 2; i++) {
		for (let j = -1; j <= 2; j++) {
			// random point offset within the cell — hash returns [-1,1], so this
			// is in [-0.5, 0.5]. Matches shader behaviour exactly.
			noise.hashRaw(pIntX + i, pIntY + j, tmpHash)
			const randOffX = tmpHash.x * 0.5
			const randOffY = tmpHash.y * 0.5
			const vx = pFracX - i - randOffX
			const vy = pFracY - j - randOffY
			const sqrDist = vx * vx + vy * vy
			if (sqrDist >= ZERO_WEIGHT_DIST_SQ) continue
			let weight = Math.exp(-sqrDist * 2)
			weight = weight - 0.01111
			if (weight < 0) weight = 0
			weightSum += weight
			const waveInput = vx * sideDirX + vy * sideDirY + offsetTau
			phaseDirX += Math.cos(waveInput) * weight
			phaseDirY += Math.sin(waveInput) * weight
		}
	}

	const invWeight = weightSum > 1e-20 ? 1 / weightSum : 0
	const ix = phaseDirX * invWeight
	const iy = phaseDirY * invWeight
	let magnitude = Math.sqrt(ix * ix + iy * iy)
	const minMag = 1 - normalization
	if (magnitude < minMag) magnitude = minMag
	out[0] = ix / magnitude
	out[1] = iy / magnitude
	out[2] = sideDirX
	out[3] = sideDirY
}

// -------------------------------------------------------------------------
// Helpers — direct ports of GLSL functions
// -------------------------------------------------------------------------
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x)
const easeOut = (t) => {
	const v = 1 - clamp01(t)
	return 1 - v * v
}
const smoothStart = (t, smoothing) => {
	if (t >= smoothing) return t - 0.5 * smoothing
	return (0.5 * t * t) / smoothing
}
const powInv = (t, power) => 1 - Math.pow(1 - clamp01(t), power)
const mix = (a, b, t) => a + (b - a) * t
const smoothstepF = (edge0, edge1, x) => {
	const t = clamp01((x - edge0) / (edge1 - edge0))
	return t * t * (3 - 2 * t)
}

// -------------------------------------------------------------------------
// Erosion filter (port of shader `ErosionFilter`). Mutates an in/out
// heightAndSlope vec3 and returns { dHeight, dSlopeX, dSlopeY, magnitude,
// ridgeMap }. `strengthMult` scales the whole filter so biomes can dial
// erosion up (mountains) or down (shorelines) smoothly.
// -------------------------------------------------------------------------
const erosionFilter = (noise, px, py, hIn, sxIn, syIn, fadeTargetIn, cfg, strengthMult, octaves, out, tmpPhac, tmpHash) => {
	let strength = cfg.strength * cfg.scale * strengthMult
	let fadeTarget = fadeTargetIn < -1 ? -1 : fadeTargetIn > 1 ? 1 : fadeTargetIn
	let h = hIn
	let sx = sxIn
	let sy = syIn

	let freq = 1 / (cfg.scale * cfg.cellScale)
	let slopeLen = Math.sqrt(sx * sx + sy * sy)
	if (slopeLen < 1e-10) slopeLen = 1e-10

	let magnitude = 0
	let roundingMult = 1
	const roundingForInput = mix(cfg.creaseRounding, cfg.ridgeRounding, clamp01(fadeTarget + 0.5)) * cfg.roundingInitMult
	let combiMask = easeOut(smoothStart(slopeLen * cfg.onsetInitial, roundingForInput * cfg.onsetInitial))
	let ridgeMapCombiMask = easeOut(slopeLen * cfg.onsetRidgeInitial)
	let ridgeMapFadeTarget = fadeTarget

	// gullySlope starts as heightAndSlope.yz mixed toward
	// heightAndSlope.yz / slopeLen * assumedSlope.x  by assumedSlope.y
	const normSx = sx / slopeLen
	const normSy = sy / slopeLen
	let gullySx = mix(sx, normSx * cfg.assumedSlopeValue, cfg.assumedSlopeAmount)
	let gullySy = mix(sy, normSy * cfg.assumedSlopeValue, cfg.assumedSlopeAmount)

	for (let i = 0; i < octaves; i++) {
		// Normalize gullySlope for the phacelle orientation
		let glen = Math.sqrt(gullySx * gullySx + gullySy * gullySy)
		let ndx, ndy
		if (glen > 1e-10) {
			ndx = gullySx / glen
			ndy = gullySy / glen
		} else {
			ndx = gullySx
			ndy = gullySy
		}

		phacelleNoise(noise, px * freq, py * freq, ndx, ndy, cfg.cellScale, 0.25, cfg.normalization, tmpPhac, tmpHash)
		const phX = tmpPhac[0]
		const phY = tmpPhac[1]
		// shader: phacelle.zw *= -freq
		const phZ = -tmpPhac[2] * freq
		const phW = -tmpPhac[3] * freq

		const sloping = Math.abs(phY)
		const sign = phY < 0 ? -1 : phY > 0 ? 1 : 0
		gullySx += sign * phZ * strength * cfg.gullyWeight
		gullySy += sign * phW * strength * cfg.gullyWeight

		// gullies = vec3(phacelle.x, phacelle.y * phacelle.zw)
		const gulliesH = phX
		const gulliesSx = phY * phZ
		const gulliesSy = phY * phW

		// fadedGullies = mix(vec3(fadeTarget,0,0), gullies * gullyWeight, combiMask)
		const fadedH = mix(fadeTarget, gulliesH * cfg.gullyWeight, combiMask)
		const fadedSx = mix(0, gulliesSx * cfg.gullyWeight, combiMask)
		const fadedSy = mix(0, gulliesSy * cfg.gullyWeight, combiMask)

		h += fadedH * strength
		sx += fadedSx * strength
		sy += fadedSy * strength

		magnitude += strength
		fadeTarget = fadedH

		const roundingForOctave = mix(cfg.creaseRounding, cfg.ridgeRounding, clamp01(phX + 0.5)) * roundingMult
		const newMask = easeOut(smoothStart(sloping * cfg.onsetOctave, roundingForOctave * cfg.onsetOctave))
		combiMask = powInv(combiMask, cfg.detail) * newMask

		ridgeMapFadeTarget = mix(ridgeMapFadeTarget, gulliesH, ridgeMapCombiMask)
		const newRidgeMask = easeOut(sloping * cfg.onsetRidgeOctave)
		ridgeMapCombiMask = ridgeMapCombiMask * newRidgeMask

		strength *= cfg.gain
		freq *= cfg.lacunarity
		roundingMult *= cfg.roundingOctaveMult
	}

	const ridgeMap = ridgeMapFadeTarget * (1 - ridgeMapCombiMask)

	out.dHeight = h - hIn
	out.dSlopeX = sx - sxIn
	out.dSlopeY = sy - syIn
	out.magnitude = magnitude
	out.ridgeMap = ridgeMap
	out.fadeTarget = fadeTarget
}

// -------------------------------------------------------------------------
// Sample cache — a small LRU keyed by quantized (x,z). getHeight / getNormal /
// isWater all hit this, sharing the ~80 noise evaluations per sample.
//
// Keys are packed numerically (string keys cost ~0.4µs/lookup in allocation
// and hashing). Coordinates quantize to 1/64 m — all terrain grids are
// multiples of 2 m so grid samples are exact, and 1.5 cm of positional
// quantization is invisible for free-position queries (vegetation, tire
// tracks, buoyancy) on terrain with slope ≤ ~1.5.
// -------------------------------------------------------------------------
const CACHE_QUANT_MULT = 64 // 1/64 m
const KEY_SCALE = 134217728 // 2^27 — collision-free for |coord| < ~1,000 km
const MAX_CACHED_COORD = 1000000
const CACHE_LIMIT = 32768
const cacheKey = (x, z) => Math.round(x * CACHE_QUANT_MULT) * KEY_SCALE + Math.round(z * CACHE_QUANT_MULT)

// -------------------------------------------------------------------------
// LOD bands — geometric band-limiting of the noise stack.
//
// A tile whose vertices are `step` meters apart cannot represent features
// with wavelength < 2·step (Nyquist); evaluating those octaves just samples
// aliased noise. Each band drops octaves whose wavelength falls below
// BAND_CUTOFF_K · step. Band 0 (step ≤ 2 m: physics tiles, gameplay queries,
// vegetation placement) always evaluates the full stack, so collisions and
// close-up visuals are bit-exact.
//
// Steps are powers of two (tileSize / TILE_RESOLUTION), so the band index is
// just log2(step / 2).
// -------------------------------------------------------------------------
const BAND_CUTOFF_K = 1.5
const MAX_BAND = 7
export const bandForStep = (step) => {
	if (!step || step <= 2) return 0
	const band = Math.round(Math.log2(step / 2))
	return band < 0 ? 0 : band > MAX_BAND ? MAX_BAND : band
}

// Number of leading octaves whose wavelength stays ≥ the cutoff.
const octavesAboveCutoff = (baseWavelength, octaves, lacunarity, cutoff) => {
	let kept = 0
	let wavelength = baseWavelength
	while (kept < octaves && wavelength >= cutoff) {
		kept++
		wavelength /= lacunarity
	}
	return kept
}

// -------------------------------------------------------------------------
// Main factory — returns the terrainHelpers API expected across the app.
// -------------------------------------------------------------------------
export const createTerrainHelpers = () => {
	const seed = TERRAIN_CONFIG.seed
	const { worldScale, heightScale, spawnRadius } = TERRAIN_CONFIG
	const erosionCfg = TERRAIN_CONFIG.erosion
	const hillsCfg = TERRAIN_CONFIG.hills
	const mountainsCfg = TERRAIN_CONFIG.mountains
	const splinePoints = TERRAIN_CONFIG.elevationSpline
	const spawnRadiusSq = spawnRadius * spawnRadius

	const erosionNoise = createNoise(seed)
	const hillsNoise = createNoise(seed * 1.61 + 7.07)
	const mountainsNoise = createNoise(seed * 5.21 + 91.91)
	const climateSampler = createClimateSampler(seed, TERRAIN_CONFIG.climate, worldScale)

	// Per-band octave counts (geometric band-limiting). Climate fields are so
	// low-frequency that every band keeps all their octaves — they are left
	// unbanded so biome values stay identical across LODs.
	const bandTables = []
	for (let band = 0; band <= MAX_BAND; band++) {
		const step = 2 * 2 ** band
		const cutoff = BAND_CUTOFF_K * step
		bandTables.push({
			hillsOctaves: octavesAboveCutoff(worldScale / hillsCfg.frequency, hillsCfg.octaves, hillsCfg.lacunarity, cutoff),
			mountainOctaves: octavesAboveCutoff(worldScale / mountainsCfg.frequency, mountainsCfg.octaves, mountainsCfg.lacunarity, cutoff),
			erosionOctaves: octavesAboveCutoff(erosionCfg.scale * erosionCfg.cellScale * worldScale, erosionCfg.octaves, erosionCfg.lacunarity, cutoff),
		})
	}

	// Scratch buffers
	const tmpND = [0, 0, 0]
	const tmpND2 = [0, 0, 0]
	const tmpPhac = [0, 0, 0, 0]
	const tmpHash = { x: 0, y: 0 }
	const splineOut = [0, 0]
	const ssShore = [0, 0]
	const ssGateC = [0, 0]
	const ssGateP = [0, 0]
	const ssHillFade = [0, 0]
	const climScratch = { c: 0, dcx: 0, dcz: 0, m: 0, p: 0, dpx: 0, dpz: 0 }
	const erosionOut = { dHeight: 0, dSlopeX: 0, dSlopeY: 0, magnitude: 0, ridgeMap: 0, fadeTarget: 0 }

	// LRU caches (Map preserves insertion order), one per LOD band so banded
	// samples never pollute the exact band-0 results.
	const bandCaches = []
	const bandCacheLimits = []
	for (let band = 0; band <= MAX_BAND; band++) {
		bandCaches.push(new Map())
		bandCacheLimits.push(band === 0 ? CACHE_LIMIT : 8192)
	}

	// Base terrain sample in world space before spline corridor deformation.
	// Heights in meters; slopes are accumulated in meters-per-shader-unit and
	// converted to world (m/m) at the end.
	const sampleBase = (x, z, bandTable) => {
		const px = x / worldScale
		const py = z / worldScale

		const clim = climateSampler.sample(x, z, climScratch)

		// === 1. Base elevation spline over continentalness ===
		evaluateElevationSpline(splinePoints, clim.c, splineOut)
		let hM = splineOut[0]
		let sxS = splineOut[1] * clim.dcx
		let szS = splineOut[1] * clim.dcz

		// === 2. Rolling hills — faded down across the shoreline so beaches
		// and the sea floor stay calm ===
		smoothstepD(hillsCfg.oceanFade[0], hillsCfg.oceanFade[1], clim.c, ssHillFade)
		const hillScale = mix(hillsCfg.oceanFloorScale, 1, ssHillFade[0])
		if (bandTable.hillsOctaves > 0) {
			fractalNoise(hillsNoise, px, py, hillsCfg.frequency, bandTable.hillsOctaves, hillsCfg.lacunarity, hillsCfg.gain, tmpND, tmpND2)
		} else {
			tmpND[0] = 0
			tmpND[1] = 0
			tmpND[2] = 0
		}
		const hillH = tmpND[0] * hillsCfg.amplitude
		const dHillScale = (1 - hillsCfg.oceanFloorScale) * ssHillFade[1]
		hM += hillH * hillScale
		sxS += tmpND[1] * hillsCfg.amplitude * hillScale + hillH * dHillScale * clim.dcx
		szS += tmpND[2] * hillsCfg.amplitude * hillScale + hillH * dHillScale * clim.dcz

		// fadeTarget steers erosion crease/ridge rounding (legacy behaviour:
		// driven by the local large-scale relief)
		let fadeTarget = clamp(hillH / (hillsCfg.amplitude * 0.6), -1, 1)

		// === 3. Ridged mountains — only inland (continental gate) and only in
		// high-mountainness regions (peaks gate) ===
		let mountainRelief = 0
		let mountainGate = 0
		smoothstepD(mountainsCfg.continentalGate[0], mountainsCfg.continentalGate[1], clim.c, ssGateC)
		if (ssGateC[0] > 0 && bandTable.mountainOctaves > 0) {
			smoothstepD(mountainsCfg.peaksGate[0], mountainsCfg.peaksGate[1], clim.p, ssGateP)
			if (ssGateP[0] > 0) {
				ridgedFractalNoise(
					mountainsNoise,
					px,
					py,
					mountainsCfg.frequency,
					bandTable.mountainOctaves,
					mountainsCfg.lacunarity,
					mountainsCfg.gain,
					tmpND,
					tmpND2,
					mountainsCfg.octaves
				)
				// Sharpen: square the ridge profile so valleys widen and crests steepen
				let r = tmpND[0]
				let drx = 2 * r * tmpND[1]
				let drz = 2 * r * tmpND[2]
				r = r * r

				const w = ssGateC[0] * ssGateP[0]
				const dwx = ssGateC[1] * clim.dcx * ssGateP[0] + ssGateC[0] * ssGateP[1] * clim.dpx
				const dwz = ssGateC[1] * clim.dcz * ssGateP[0] + ssGateC[0] * ssGateP[1] * clim.dpz

				hM += r * mountainsCfg.amplitude * w
				sxS += mountainsCfg.amplitude * (drx * w + r * dwx)
				szS += mountainsCfg.amplitude * (drz * w + r * dwz)

				mountainGate = w
				mountainRelief = r * w
				fadeTarget = clamp(fadeTarget + (r * 2 - 1) * w, -1, 1)
			}
		}

		// === 4. Erosion — full strength inland, boosted in mountains, faded
		// out across the beach band and skipped underwater (the sea hides it,
		// and skipping makes ocean tiles ~5x cheaper) ===
		smoothstepD(erosionCfg.shoreFade[0], erosionCfg.shoreFade[1], hM, ssShore)
		const erosionMult = ssShore[0] * (1 + (erosionCfg.mountainBoost - 1) * mountainGate)

		let ridgeMap = 1
		let erosionVal = 0
		if (erosionMult > 0.02 && bandTable.erosionOctaves > 0) {
			const invHeightScale = 1 / heightScale
			const hN = hM * invHeightScale
			const sxN = sxS * invHeightScale
			const szN = szS * invHeightScale

			erosionFilter(erosionNoise, px, py, hN, sxN, szN, fadeTarget, erosionCfg, erosionMult, bandTable.erosionOctaves, erosionOut, tmpPhac, tmpHash)

			const offset = mix(erosionCfg.heightOffset, -erosionOut.fadeTarget, erosionCfg.heightOffsetPreserve) * erosionOut.magnitude
			hM = (hN + erosionOut.dHeight + offset) * heightScale
			sxS = (sxN + erosionOut.dSlopeX) * heightScale
			szS = (szN + erosionOut.dSlopeY) * heightScale
			ridgeMap = erosionOut.ridgeMap
			erosionVal = erosionOut.dHeight / (erosionOut.magnitude || 1)
		}

		// Convert slopes from meters-per-shader-unit to world m/m
		let worldHeight = hM
		let worldSlopeX = sxS / worldScale
		let worldSlopeZ = szS / worldScale

		// === 5. Spawn flatten — blend world height toward 0 near origin ===
		if (x * x + z * z < spawnRadiusSq) {
			const dist = Math.sqrt(x * x + z * z)
			const t = dist / spawnRadius
			const blend = t * t * (3 - 2 * t)
			worldHeight *= blend
			worldSlopeX *= blend
			worldSlopeZ *= blend
			// Push ridgemap positive inside spawn.
			ridgeMap = mix(1, ridgeMap, blend)
		}

		return {
			height: worldHeight,
			slopeX: worldSlopeX,
			slopeZ: worldSlopeZ,
			ridgeMap,
			erosion: erosionVal,
			climate: {
				continental: clim.c,
				moisture: clim.m,
				mountain: mountainRelief,
			},
			// Filled in by splineCorridors.applyToSample — declared here so the
			// object keeps a stable hidden class (no shape transition on assign).
			surface: null,
		}
	}

	// Road routing always samples the exact (band 0) terrain.
	const splineCorridors = createSplineCorridorSystem(TERRAIN_CONFIG.roads, (x, z) => sampleBase(x, z, bandTables[0]))
	const roadVisualRoutes = splineCorridors.getRoadVisualRoutes()

	const roadConfig = TERRAIN_CONFIG.roads
	const spawnSafeRadius = roadConfig?.spawnSafeRadius ?? 0
	const spawnSafeTransition = roadConfig?.spawnSafeTransition ?? 0
	const spawnSafeEnd = spawnSafeRadius + spawnSafeTransition

	// Full sample in world space. Caches the climate + height sample and
	// applies spline corridors and the road spawn-safe flatten.
	// Returns all derived quantities — callers pick what they need.
	//
	// `step` (optional) is the caller's sample spacing in meters; coarse steps
	// evaluate a band-limited (cheaper) noise stack. Omit it (band 0) for
	// anything gameplay-visible up close: physics, vegetation placement,
	// object snapping.
	const sample = (x, z, step = 0) => {
		const band = step > 2 ? bandForStep(step) : 0
		const cache = bandCaches[band]
		const cacheable = x < MAX_CACHED_COORD && x > -MAX_CACHED_COORD && z < MAX_CACHED_COORD && z > -MAX_CACHED_COORD
		const key = cacheable ? cacheKey(x, z) : 0
		if (cacheable) {
			const cached = cache.get(key)
			// FIFO eviction (no LRU touch): the delete+set reorder costs more than
			// the occasional recompute it saves — capacity (32k) dwarfs any
			// per-frame working set, so hot entries effectively never evict.
			if (cached !== undefined) return cached
		}

		// applyToSample mutates and returns the (freshly allocated) base sample.
		const result = splineCorridors.applyToSample(x, z, sampleBase(x, z, bandTables[band]))

		if (result.height > 0 && spawnSafeEnd > 0) {
			const distSq = x * x + z * z
			if (distSq < spawnSafeEnd * spawnSafeEnd) {
				const dist = Math.sqrt(distSq)
				const safeWeight = dist <= spawnSafeRadius ? 1 : 1 - smoothstepF(spawnSafeRadius, spawnSafeEnd, dist)
				result.height = mix(result.height, 0, safeWeight)
			}
		}

		if (cacheable) {
			cache.set(key, result)
			if (cache.size > bandCacheLimits[band]) {
				// Evict oldest entry (Map iteration order is insertion order)
				cache.delete(cache.keys().next().value)
			}
		}
		return result
	}

	const getHeight = (x, z, step = 0) => sample(x, z, step).height
	const getClimate = (x, z) => sample(x, z).climate

	const getNormal = (x, z, target = new Vector3()) => {
		const s = sample(x, z)
		if (s.surface?.heightInfluence > 0.001) {
			const step = TERRAIN_CONFIG.roads?.normalSampleStep ?? 2
			const hL = getHeight(x - step, z)
			const hR = getHeight(x + step, z)
			const hD = getHeight(x, z - step)
			const hU = getHeight(x, z + step)
			const dhdx = (hR - hL) / (step * 2)
			const dhdz = (hU - hD) / (step * 2)
			const nx = -dhdx
			const nz = -dhdz
			const invLen = 1 / Math.sqrt(nx * nx + 1 + nz * nz)
			return target.set(nx * invLen, invLen, nz * invLen)
		}

		// Normal perpendicular to (slopeX, 1, slopeZ) — matches existing convention.
		const nx = -s.slopeX
		const nz = -s.slopeZ
		const invLen = 1 / Math.sqrt(nx * nx + 1 + nz * nz)
		return target.set(nx * invLen, invLen, nz * invLen)
	}

	const isWater = (x, z) => sample(x, z).height < WATER_CONFIG.level
	const getSurface = (x, z) => sample(x, z).surface

	return {
		getHeight,
		getNormal,
		getSurface,
		getClimate,
		isWater,
		getRoadVisualRoutes: () => roadVisualRoutes,
		// Exposed for debugging / future shader-side use.
		sample,
	}
}
