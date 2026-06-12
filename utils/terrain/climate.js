// Climate field sampler — the biome backbone of the infinite world.
//
// Three deterministic low-frequency fields drive everything:
//   continentalness (c) — deep ocean (-1) → shoreline (~0) → far inland (+1).
//     Domain-warped so coastlines meander instead of looking like blobs.
//   moisture (m)        — arid sandy desert (0) → lush grassland/forest (1).
//   mountainness (p)    — where inland terrain is allowed to grow ridged peaks.
//
// Continentalness and mountainness carry analytic derivatives (in shader
// space, i.e. per worldScale meters) because they feed the height function;
// moisture only drives materials/vegetation so it stays derivative-free.
//
// A spawn blend eases all three fields toward configured target values near
// the origin so every seed spawns in the same flat coastal-desert setting.

import { createNoise, fractalNoise, fractalAmplitude, smoothstepD } from './noise'

const mix = (a, b, t) => a + (b - a) * t

export const createClimateSampler = (seed, climateConfig, worldScale) => {
	const cfg = climateConfig
	const cCfg = cfg.continental
	const mCfg = cfg.moisture
	const pCfg = cfg.mountain
	const spawn = cfg.spawn

	// Independent noise instances per field (and per warp axis) so the fields
	// are fully decorrelated while still deriving from the single world seed.
	const noiseC = createNoise(seed * 1.13 + 17.17)
	const noiseWarpX = createNoise(seed * 2.71 + 31.31)
	const noiseWarpY = createNoise(seed * 3.37 + 47.47)
	const noiseM = createNoise(seed * 4.93 + 59.59)
	const noiseP = createNoise(seed * 6.07 + 73.73)

	const cAmp = fractalAmplitude(cCfg.octaves, cCfg.gain)
	const mAmp = fractalAmplitude(mCfg.octaves, mCfg.gain)
	const pAmp = fractalAmplitude(pCfg.octaves, pCfg.gain)

	// Scratch buffers
	const ndA = [0, 0, 0]
	const ndB = [0, 0, 0]
	const ndTmp = [0, 0, 0]
	const ssTmp = [0, 0]

	const spawnInner = spawn.innerRadius
	const spawnOuter = spawn.radius

	/**
	 * Sample climate at world (x, z) into `out`:
	 * { c, dcx, dcz, m, p, dpx, dpz }
	 * Derivatives are w.r.t. shader-space coordinates (x / worldScale).
	 */
	const sample = (x, z, out) => {
		const px = x / worldScale
		const py = z / worldScale

		// --- Continentalness (domain-warped fbm, analytic derivative chain) ---
		const wf = cCfg.warpFrequency
		const ws = cCfg.warpStrength
		noiseWarpX.noised(px * wf, py * wf, ndA)
		noiseWarpY.noised(px * wf, py * wf, ndB)
		const qx = px + ndA[0] * ws
		const qy = py + ndB[0] * ws
		// Jacobian of the warped coordinates
		const dqx_dx = 1 + ndA[1] * wf * ws
		const dqx_dz = ndA[2] * wf * ws
		const dqy_dx = ndB[1] * wf * ws
		const dqy_dz = 1 + ndB[2] * wf * ws

		fractalNoise(noiseC, qx, qy, cCfg.frequency, cCfg.octaves, cCfg.lacunarity, cCfg.gain, ndA, ndTmp)
		// Normalized fbm concentrates around 0 (std ≈ 0.13 of the amplitude
		// sum), so a tanh contrast curve stretches it across the full [-1, 1]
		// biome range while keeping the derivative chain analytic and smooth.
		const cContrast = cCfg.contrast / cAmp
		let c = Math.tanh(ndA[0] * cContrast + (cCfg.bias ?? 0))
		const dcGain = cContrast * (1 - c * c)
		let dcx = (ndA[1] * dqx_dx + ndA[2] * dqy_dx) * dcGain
		let dcz = (ndA[1] * dqx_dz + ndA[2] * dqy_dz) * dcGain

		// --- Moisture (plain fbm, contrast-stretched, mapped to [0,1]) ---
		fractalNoise(noiseM, px, py, mCfg.frequency, mCfg.octaves, mCfg.lacunarity, mCfg.gain, ndA, ndTmp)
		let m = 0.5 + 0.5 * Math.tanh((ndA[0] * mCfg.contrast) / mAmp)

		// --- Mountainness (plain fbm, contrast-stretched, mapped to [0,1]) ---
		fractalNoise(noiseP, px, py, pCfg.frequency, pCfg.octaves, pCfg.lacunarity, pCfg.gain, ndA, ndTmp)
		const pContrast = pCfg.contrast / pAmp
		const pT = Math.tanh(ndA[0] * pContrast)
		let p = 0.5 + 0.5 * pT
		const dpGain = 0.5 * pContrast * (1 - pT * pT)
		let dpx = ndA[1] * dpGain
		let dpz = ndA[2] * dpGain

		// --- Spawn blend — guarantee a flat coastal-desert start area ---
		const distSq = x * x + z * z
		if (distSq < spawnOuter * spawnOuter) {
			const dist = Math.sqrt(distSq)
			smoothstepD(spawnInner, spawnOuter, dist, ssTmp)
			const w = ssTmp[0]
			// dw is w.r.t. world meters; convert to shader space (× worldScale)
			const dwdd = ssTmp[1] * worldScale
			const dirX = dist > 1e-6 ? x / dist : 0
			const dirZ = dist > 1e-6 ? z / dist : 0

			// value' = mix(target, value, w); d/dx = dValue·w + (value-target)·dw
			dcx = dcx * w + (c - spawn.continental) * dwdd * dirX
			dcz = dcz * w + (c - spawn.continental) * dwdd * dirZ
			c = mix(spawn.continental, c, w)

			m = mix(spawn.moisture, m, w)

			dpx = dpx * w + (p - spawn.mountain) * dwdd * dirX
			dpz = dpz * w + (p - spawn.mountain) * dwdd * dirZ
			p = mix(spawn.mountain, p, w)
		}

		out.c = c
		out.dcx = dcx
		out.dcz = dcz
		out.m = m
		out.p = p
		out.dpx = dpx
		out.dpz = dpz
		return out
	}

	return { sample }
}

/**
 * Evaluate a piecewise-smoothstep elevation spline.
 * points: sorted array of [continentalness, heightMeters].
 * out: [height, dHeight/dContinentalness]
 */
export const evaluateElevationSpline = (points, c, out) => {
	const first = points[0]
	const last = points[points.length - 1]
	if (c <= first[0]) {
		out[0] = first[1]
		out[1] = 0
		return
	}
	if (c >= last[0]) {
		out[0] = last[1]
		out[1] = 0
		return
	}
	let i = 1
	while (points[i][0] < c) i++
	const p0 = points[i - 1]
	const p1 = points[i]
	const range = p1[0] - p0[0]
	const t = (c - p0[0]) / range
	const s = t * t * (3 - 2 * t)
	out[0] = p0[1] + (p1[1] - p0[1]) * s
	out[1] = ((p1[1] - p0[1]) * 6 * t * (1 - t)) / range
}
