// Shared deterministic noise primitives for terrain generation.
// CPU ports of the shader-style gradient noise used across the terrain
// pipeline. All functions are seeded and allocation-free (scratch buffers
// are provided by callers), so they stay deterministic and fast.

// -------------------------------------------------------------------------
// Hash / gradient noise. Returns (value, dvalue/dx, dvalue/dy) in [-1,1].
// Deterministic from seed via a per-instance offset baked into the hash.
// -------------------------------------------------------------------------
export const createNoise = (seed) => {
	// Seed acts as a 2D offset applied before hashing so the noise is stable
	// across runs but varies with the seed.
	const seedA = Math.sin(seed * 12.9898) * 43758.5453
	const seedB = Math.sin(seed * 78.233) * 43758.5453
	const seedOffX = seedA - Math.floor(seedA)
	const seedOffY = seedB - Math.floor(seedB)

	// shader's hash returns a vec2 in [-1, 1]
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

		hashRaw(ix, iy, ga)
		hashRaw(ix + 1, iy, gb)
		hashRaw(ix, iy + 1, gc)
		hashRaw(ix + 1, iy + 1, gd)

		// dot products of gradients with corner-relative positions
		const va = ga.x * fx + ga.y * fy
		const vb = gb.x * (fx - 1) + gb.y * fy
		const vc = gc.x * fx + gc.y * (fy - 1)
		const vd = gd.x * (fx - 1) + gd.y * (fy - 1)

		const value = va + ux * (vb - va) + uy * (vc - va) + ux * uy * (va - vb - vc + vd)

		// analytic derivatives
		const dx = ga.x + ux * (gb.x - ga.x) + uy * (gc.x - ga.x) + ux * uy * (ga.x - gb.x - gc.x + gd.x) + dux * (uy * (va - vb - vc + vd) + (vb - va))
		const dy = ga.y + ux * (gb.y - ga.y) + uy * (gc.y - ga.y) + ux * uy * (ga.y - gb.y - gc.y + gd.y) + duy * (ux * (va - vb - vc + vd) + (vc - va))

		out[0] = value
		out[1] = dx
		out[2] = dy
	}

	return { noised, hashRaw }
}

// -------------------------------------------------------------------------
// Fractal noise. Accumulates (value, dx, dy) with proper frequency scaling
// of the derivatives (× freq per octave).
// -------------------------------------------------------------------------
export const fractalNoise = (noise, px, py, freq, octaves, lacunarity, gain, outND, tmpND) => {
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

// Sum of octave amplitudes for normalizing fractal noise to ~[-1, 1].
export const fractalAmplitude = (octaves, gain) => {
	let amp = 0
	let na = 1
	for (let i = 0; i < octaves; i++) {
		amp += na
		na *= gain
	}
	return amp
}

// -------------------------------------------------------------------------
// Ridged fractal noise. Each octave contributes (1 - |n|) ∈ [0, ~2] mapped
// so the composite stays in [0, 1] after normalization. Derivatives stay
// analytic via d|n| = sign(n) · dn. Higher octaves are damped where the
// composite is low (classic ridged-multifractal weighting) so valley floors
// stay smooth while crests pick up detail.
// -------------------------------------------------------------------------
export const ridgedFractalNoise = (noise, px, py, freq, octaves, lacunarity, gain, outND, tmpND, normOctaves = octaves) => {
	let nv = 0
	let nvx = 0
	let nvy = 0
	let nf = freq
	let na = 1
	// Normalize by the amplitude of `normOctaves` so evaluating a truncated
	// (band-limited) octave prefix yields exactly the full signal minus the
	// dropped octaves' contribution, instead of a renormalized signal.
	let ampSum = 0
	let normA = 1
	for (let i = 0; i < normOctaves; i++) {
		ampSum += normA
		normA *= gain
	}
	let weight = 1
	for (let i = 0; i < octaves; i++) {
		noise.noised(px * nf, py * nf, tmpND)
		const n = tmpND[0]
		const sign = n < 0 ? -1 : 1
		const ridge = 1 - sign * n // 1 - |n|
		const dRidgeX = -sign * tmpND[1] * nf
		const dRidgeY = -sign * tmpND[2] * nf

		const a = na * weight
		nv += ridge * a
		nvx += dRidgeX * a
		nvy += dRidgeY * a

		// Weight the next octave by this one's ridge value (clamped) so detail
		// concentrates on crests. Derivative of the weighting is intentionally
		// dropped — it is a second-order term and visually irrelevant.
		weight = ridge * 0.5
		if (weight > 1) weight = 1
		if (weight < 0) weight = 0

		na *= gain
		nf *= lacunarity
	}
	const invAmp = 1 / ampSum
	outND[0] = nv * invAmp
	outND[1] = nvx * invAmp
	outND[2] = nvy * invAmp
}

// Smoothstep with analytic derivative w.r.t. x. out = [value, dvalue/dx]
export const smoothstepD = (edge0, edge1, x, out) => {
	const range = edge1 - edge0
	let t = (x - edge0) / range
	if (t <= 0) {
		out[0] = 0
		out[1] = 0
		return
	}
	if (t >= 1) {
		out[0] = 1
		out[1] = 0
		return
	}
	out[0] = t * t * (3 - 2 * t)
	out[1] = (6 * t * (1 - t)) / range
}
