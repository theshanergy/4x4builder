// Terrain Height Sampler — Phacelle-noise erosion (CPU port of the shader in
// docs/advanced-terrain-erosion.html). Drives both the visual mesh and the
// physics heightfield.

import { Vector3 } from 'three'

import TERRAIN_CONFIG from '../../config/terrain'
import WATER_CONFIG from '../../config/water'
import { createSplineCorridorSystem } from './splineCorridors'

// -------------------------------------------------------------------------
// Hash / gradient noise (port of shader `hash` + `noised`). Returns
// (value, dvalue/dx, dvalue/dy) in [-1,1]. Deterministic from seed via a
// per-instance offset baked into the hash.
// -------------------------------------------------------------------------
const createNoise = (seed) => {
	// Seed acts as a 2D offset applied before hashing so the noise is stable
	// across runs but varies with TERRAIN_CONFIG.seed.
	const seedA = Math.sin(seed * 12.9898) * 43758.5453
	const seedB = Math.sin(seed * 78.233) * 43758.5453
	const seedOffX = seedA - Math.floor(seedA)
	const seedOffY = seedB - Math.floor(seedB)

	// shader's hash returns a vec2 in [-1, 1]
	const hash = (ix, iy, out) => {
		const kx = 0.3183099
		const ky = 0.3678794
		// x = x * k + k.yx
		let x = (ix + seedOffX) * kx + ky
		let y = (iy + seedOffY) * ky + kx
		// fract(x.x * x.y * (x.x + x.y))
		let s = x * y * (x + y)
		s = s - Math.floor(s)
		// 16 * k * fract(...)
		const fx = 16 * kx * s
		const fy = 16 * ky * s
		// fract again, map to [-1,1]
		out.x = -1 + 2 * (fx - Math.floor(fx))
		out.y = -1 + 2 * (fy - Math.floor(fy))
	}

	// scratch gradients reused per noised() call
	const ga = { x: 0, y: 0 }
	const gb = { x: 0, y: 0 }
	const gc = { x: 0, y: 0 }
	const gd = { x: 0, y: 0 }

	// out: [value, dvalue/dx, dvalue/dy]
	const noised = (x, y, out) => {
		const ix = Math.floor(x)
		const iy = Math.floor(y)
		const fx = x - ix
		const fy = y - iy

		// quintic smoothstep and its derivative
		const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
		const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
		const dux = 30 * fx * fx * (fx * (fx - 2) + 1)
		const duy = 30 * fy * fy * (fy * (fy - 2) + 1)

		hash(ix, iy, ga)
		hash(ix + 1, iy, gb)
		hash(ix, iy + 1, gc)
		hash(ix + 1, iy + 1, gd)

		// dot products of gradients with corner-relative positions
		const va = ga.x * fx + ga.y * fy
		const vb = gb.x * (fx - 1) + gb.y * fy
		const vc = gc.x * fx + gc.y * (fy - 1)
		const vd = gd.x * (fx - 1) + gd.y * (fy - 1)

		const value = va + ux * (vb - va) + uy * (vc - va) + ux * uy * (va - vb - vc + vd)

		// analytic derivatives (matches shader's noised())
		const dx = ga.x + ux * (gb.x - ga.x) + uy * (gc.x - ga.x) + ux * uy * (ga.x - gb.x - gc.x + gd.x) + dux * (uy * (va - vb - vc + vd) + (vb - va))
		const dy = ga.y + ux * (gb.y - ga.y) + uy * (gc.y - ga.y) + ux * uy * (ga.y - gb.y - gc.y + gd.y) + duy * (ux * (va - vb - vc + vd) + (vc - va))

		out[0] = value
		out[1] = dx
		out[2] = dy
	}

	return { noised }
}

// -------------------------------------------------------------------------
// Phacelle noise (port of shader `PhacelleNoise`). Returns four scalars:
//   (interpolated.x, interpolated.y, sideDir.x, sideDir.y)
// where `interpolated` is the aggregated wave vector and `sideDir` is the
// perpendicular-to-slope direction used to drive gully orientation.
// -------------------------------------------------------------------------
const TAU = Math.PI * 2

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
			// random point offset within the cell [0, 0.5]
			// shader uses hash(gridPoint) * 0.5 — hash returns [-1,1],
			// so this is actually in [-0.5, 0.5]. Match shader behaviour exactly.
			noise.hashRaw(pIntX + i, pIntY + j, tmpHash)
			const randOffX = tmpHash.x * 0.5
			const randOffY = tmpHash.y * 0.5
			const vx = pFracX - i - randOffX
			const vy = pFracY - j - randOffY
			const sqrDist = vx * vx + vy * vy
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
// Fractal noise (port of shader `FractalNoise`). Accumulates (value, dx, dy)
// with proper frequency scaling of the derivatives (× freq per octave).
// -------------------------------------------------------------------------
const fractalNoise = (noise, px, py, freq, octaves, lacunarity, gain, outND, tmpND) => {
	let nv = 0
	let nvx = 0
	let nvy = 0
	let nf = freq
	let na = 1
	for (let i = 0; i < octaves; i++) {
		noise.noised(px * nf, py * nf, tmpND)
		nv += tmpND[0] * na
		nvx += tmpND[1] * na * nf
		nvy += tmpND[2] * na * nf
		na *= gain
		nf *= lacunarity
	}
	outND[0] = nv
	outND[1] = nvx
	outND[2] = nvy
}

// -------------------------------------------------------------------------
// Erosion filter (port of shader `ErosionFilter`). Mutates an in/out
// heightAndSlope vec3 and returns { dHeight, dSlopeX, dSlopeY, magnitude,
// ridgeMap }. Strength is pre-scaled.
// -------------------------------------------------------------------------
const erosionFilter = (noise, px, py, hIn, sxIn, syIn, fadeTargetIn, cfg, out, tmpPhac, tmpHash) => {
	let strength = cfg.strength * cfg.scale
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

	for (let i = 0; i < cfg.octaves; i++) {
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
// -------------------------------------------------------------------------
const CACHE_QUANT = 0.001 // sub-millimeter — effectively exact for fp32 grids
const CACHE_LIMIT = 32768
const cacheKey = (x, z) => {
	// Pack quantized coords into a string key. Integer mult keeps numeric.
	const qx = Math.round(x / CACHE_QUANT)
	const qz = Math.round(z / CACHE_QUANT)
	return qx + ':' + qz
}

// -------------------------------------------------------------------------
// Main factory — returns the terrainHelpers API expected across the app.
// -------------------------------------------------------------------------
export const createTerrainHelpers = () => {
	const seed = TERRAIN_CONFIG.seed
	const baseNoise = createNoise(seed)

	// Seed offsets baked into the hash, matching createNoise().
	const seedA = Math.sin(seed * 12.9898) * 43758.5453
	const seedB = Math.sin(seed * 78.233) * 43758.5453
	const seedOffX = seedA - Math.floor(seedA)
	const seedOffY = seedB - Math.floor(seedB)

	// Raw hash for phacelleNoise (needs the unsmoothed hash, not noised()).
	const hashRaw = (ix, iy, out) => {
		const kx = 0.3183099
		const ky = 0.3678794
		let x = (ix + seedOffX) * kx + ky
		let y = (iy + seedOffY) * ky + kx
		let s = x * y * (x + y)
		s = s - Math.floor(s)
		const fx = 16 * kx * s
		const fy = 16 * ky * s
		out.x = -1 + 2 * (fx - Math.floor(fx))
		out.y = -1 + 2 * (fy - Math.floor(fy))
	}

	const noise = {
		noised: baseNoise.noised,
		hashRaw,
	}

	const { worldScale, heightScale, heightOrigin, spawnRadius, ocean } = TERRAIN_CONFIG
	const cfg = TERRAIN_CONFIG.erosion
	const spawnRadiusSq = spawnRadius * spawnRadius
	const oceanRadiusSq = ocean.radius * ocean.radius
	const oceanTransitionStart = ocean.radius - ocean.transition
	const oceanTransitionStartSq = oceanTransitionStart * oceanTransitionStart
	const oceanFloorHeight = WATER_CONFIG.level - ocean.depth
	const oceanMidpointHeight = oceanFloorHeight * ocean.beachMidpointDepth

	// Scratch buffers
	const tmpND = [0, 0, 0]
	const tmpND2 = [0, 0, 0]
	const tmpPhac = [0, 0, 0, 0]
	const tmpHash = { x: 0, y: 0 }
	const erosionOut = { dHeight: 0, dSlopeX: 0, dSlopeY: 0, magnitude: 0, ridgeMap: 0, fadeTarget: 0 }

	// LRU cache (Map preserves insertion order)
	const cache = new Map()
	const cacheResult = (key, result) => {
		cache.set(key, result)
		if (cache.size > CACHE_LIMIT) {
			// Evict oldest entry (Map iteration order is insertion order)
			const firstKey = cache.keys().next().value
			cache.delete(firstKey)
		}
		return result
	}

	// Raw sample in shader-normalized space. Returns full info for this (x,z).
	const sampleRaw = (px, py) => {
		// === Base fractal noise (eroded-surface seed) ===
		fractalNoise(noise, px, py, TERRAIN_CONFIG.heightFrequency, TERRAIN_CONFIG.heightOctaves, TERRAIN_CONFIG.heightLacunarity, TERRAIN_CONFIG.heightGain, tmpND, tmpND2)
		// n *= HEIGHT_AMP; shader scales value and derivs by heightAmp
		const h0 = tmpND[0] * TERRAIN_CONFIG.heightAmp
		const sx0 = tmpND[1] * TERRAIN_CONFIG.heightAmp
		const sy0 = tmpND[2] * TERRAIN_CONFIG.heightAmp

		// shader: fadeTarget = clamp(n.x / (HEIGHT_AMP * 0.6), -1, 1)
		const fadeTarget = Math.max(-1, Math.min(1, h0 / (TERRAIN_CONFIG.heightAmp * 0.6)))
		// shader: n = n * 0.5 + vec3(0.5, 0, 0)
		const h1 = h0 * 0.5 + 0.5
		const sx1 = sx0 * 0.5
		const sy1 = sy0 * 0.5

		// === Erosion ===
		erosionFilter(noise, px, py, h1, sx1, sy1, fadeTarget, cfg, erosionOut, tmpPhac, tmpHash)

		// shader: offset = mix(heightOffset, -fadeTarget, heightOffsetPreserve) * magnitude
		const offset = mix(cfg.heightOffset, -fadeTarget, cfg.heightOffsetPreserve) * erosionOut.magnitude
		const eroded = h1 + erosionOut.dHeight + offset
		const slopeX = sx1 + erosionOut.dSlopeX
		const slopeY = sy1 + erosionOut.dSlopeY

		return {
			height: eroded,
			slopeX,
			slopeY,
			ridgeMap: erosionOut.ridgeMap,
			erosion: erosionOut.dHeight / (erosionOut.magnitude || 1),
			magnitude: erosionOut.magnitude,
		}
	}

	// Base terrain sample in world space before spline corridor deformation.
	// Returns all derived quantities; road/rivers are applied in sample().
	const sampleBase = (x, z) => {
		const distSq = x * x + z * z
		if (distSq >= oceanRadiusSq) {
			return {
				height: oceanFloorHeight,
				slopeX: 0,
				slopeZ: 0,
				ridgeMap: 1,
				erosion: 0,
			}
		}

		const px = x / worldScale
		const py = z / worldScale
		const raw = sampleRaw(px, py)

		// Map shader-height [0,1] to world meters.
		// worldHeight = (shaderHeight - heightOrigin) * heightScale
		let worldHeight = (raw.height - heightOrigin) * heightScale

		// Slope in world space: dHeight/dx_world = dHeight_shader/dp * (1/worldScale) * heightScale
		const slopeScale = heightScale / worldScale
		let worldSlopeX = raw.slopeX * slopeScale
		let worldSlopeZ = raw.slopeY * slopeScale

		// Spawn flatten — blend world height toward 0 near origin.
		// Also smooth the ridgemap so debug samples stay coherent.
		let ridgeMap = raw.ridgeMap
		if (distSq < spawnRadiusSq) {
			const dist = Math.sqrt(distSq)
			const t = dist / spawnRadius
			const blend = t * t * (3 - 2 * t)
			worldHeight *= blend
			worldSlopeX *= blend
			worldSlopeZ *= blend
			// Push ridgemap positive inside spawn.
			ridgeMap = mix(1, ridgeMap, blend)
		}

		// Ocean falloff — terrain tapers into the ocean beyond oceanRadius.
		// Mirrors the beach profile from the original Terrain component.
		if (distSq > oceanTransitionStartSq) {
			const dist = Math.sqrt(distSq)
			const t = (dist - oceanTransitionStart) / ocean.transition // 0 at shore, 1 at ocean
			const bezierT = t * t * (3 - 2 * t) // smoothstep

			// Two-stage beach profile: gentle slope then steeper drop-off
			let beachHeight
			if (t < 0.5) {
				const localT = t * 2
				beachHeight = worldHeight * (1 - localT) + oceanMidpointHeight * localT
			} else {
				const localT = (t - 0.5) * 2
				const dropCurve = localT * localT // Quadratic — steeper descent
				beachHeight = oceanMidpointHeight * (1 - dropCurve) + oceanFloorHeight * dropCurve
			}

			// Suppress terrain noise as we enter the water
			const noiseSuppression = (1 - bezierT) * (1 - bezierT) * (1 - bezierT)
			worldHeight = worldHeight * noiseSuppression + beachHeight * (1 - noiseSuppression)
			worldSlopeX *= noiseSuppression
			worldSlopeZ *= noiseSuppression
			ridgeMap = mix(ridgeMap, 1, bezierT)
		}

		return {
			height: worldHeight,
			slopeX: worldSlopeX,
			slopeZ: worldSlopeZ,
			ridgeMap,
			erosion: raw.erosion,
		}
	}

	const splineCorridors = createSplineCorridorSystem(TERRAIN_CONFIG.roads, sampleBase)
	const roadVisualRoutes = splineCorridors.getRoadVisualRoutes()

	// Full sample in world space. Caches the shader-space sample and applies
	// the world-space height remap, spawn/ocean shaping, and spline corridors.
	// Returns all derived quantities — callers pick what they need.
	const sample = (x, z) => {
		const key = cacheKey(x, z)
		const cached = cache.get(key)
		if (cached !== undefined) {
			// LRU touch — re-insert
			cache.delete(key)
			cache.set(key, cached)
			return cached
		}

		const base = sampleBase(x, z)
		const result = splineCorridors.applyToSample(x, z, base)
		const roadConfig = TERRAIN_CONFIG.roads
		const spawnSafeRadius = roadConfig?.spawnSafeRadius ?? 0
		const spawnSafeTransition = roadConfig?.spawnSafeTransition ?? 0
		const spawnSafeEnd = spawnSafeRadius + spawnSafeTransition

		if (result.height > 0 && spawnSafeEnd > 0) {
			const distSq = x * x + z * z
			if (distSq < spawnSafeEnd * spawnSafeEnd) {
				const dist = Math.sqrt(distSq)
				const safeWeight = dist <= spawnSafeRadius ? 1 : 1 - smoothstepF(spawnSafeRadius, spawnSafeEnd, dist)
				result.height = mix(result.height, 0, safeWeight)
			}
		}

		return cacheResult(key, result)
	}

	const getHeight = (x, z) => sample(x, z).height

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
		isWater,
		getRoadVisualRoutes: () => roadVisualRoutes,
		// Exposed for debugging / future shader-side use.
		sample,
	}
}
