/**
 * Web Worker: synthetic shore-zone depth processing.
 *
 * Receives a decoded 256×256 elevation Float32Array plus config, runs the BFS
 * distance transform + synthetic depth blend in-place, then transfers the buffer
 * back to the main thread (zero-copy via Transferable).
 *
 * Message in:  { elevations: Float32Array, z: number, config: object }
 * Message out: { elevations: Float32Array }
 */

const ELEVATION_TILE_SIZE = 256

self.onmessage = ({ data: { elevations, z, config } }) => {
	const sz = ELEVATION_TILE_SIZE
	const pixelSize = 156543 / (2 ** z)

	const { level: waterLevel, syntheticShoreThreshold, syntheticMaxDepth, syntheticFalloffDistance, syntheticBlendThreshold } = config
	const shoreLevel = waterLevel + syntheticShoreThreshold
	const falloffDist = syntheticFalloffDistance
	const blendThresh = syntheticBlendThreshold
	const maxDepth = syntheticMaxDepth

	// BFS distance transform — seeded from solid-land pixels
	const distPx = new Float32Array(sz * sz).fill(Infinity)
	const queue = new Int32Array(sz * sz)
	let head = 0, tail = 0

	for (let i = 0; i < sz * sz; i++) {
		if (elevations[i] > shoreLevel) {
			distPx[i] = 0
			queue[tail++] = i
		}
	}

	while (head < tail) {
		const idx = queue[head++]
		const next = distPx[idx] + 1
		const row = (idx / sz) | 0
		const col = idx % sz
		if (row > 0)    { const n = idx - sz; if (next < distPx[n]) { distPx[n] = next; queue[tail++] = n } }
		if (row < sz-1) { const n = idx + sz; if (next < distPx[n]) { distPx[n] = next; queue[tail++] = n } }
		if (col > 0)    { const n = idx - 1;  if (next < distPx[n]) { distPx[n] = next; queue[tail++] = n } }
		if (col < sz-1) { const n = idx + 1;  if (next < distPx[n]) { distPx[n] = next; queue[tail++] = n } }
	}

	// Apply synthetic blend for all shore-zone pixels
	for (let i = 0; i < sz * sz; i++) {
		const height = elevations[i]
		if (height > shoreLevel) continue

		const dist = distPx[i] * pixelSize
		const t = Math.max(0, Math.min(1, (dist - blendThresh) / (falloffDist - blendThresh)))
		const syntheticH = waterLevel - maxDepth * t * t * (3 - 2 * t)
		const rawBlend = Math.max(0, Math.min(1, (height - waterLevel) / syntheticShoreThreshold))
		const blend = rawBlend * rawBlend * (3 - 2 * rawBlend)
		elevations[i] = syntheticH + (height - syntheticH) * blend
	}

	// Transfer the buffer back — zero-copy, main thread regains ownership
	self.postMessage({ elevations }, [elevations.buffer])
}
