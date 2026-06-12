// Minimal isolated per-sample perf probe (no other workload beforehand).
import { createTerrainHelpers } from '../utils/terrain/heightSampler.js'

const helpers = createTerrainHelpers()

const timeSamples = (cx, cz, label) => {
	const N = 5000
	// warmup
	for (let i = 0; i < N; i++) helpers.sample(cx + 40000 + (i % 100) * 1.37, cz + 40000 + Math.floor(i / 100) * 1.91)
	const start = performance.now()
	for (let i = 0; i < N; i++) {
		helpers.sample(cx + (i % 100) * 1.37, cz + Math.floor(i / 100) * 1.91)
	}
	const ms = performance.now() - start
	console.log(`perf ${label}: ${((ms * 1000) / N).toFixed(1)}µs/sample`)
}

timeSamples(6000, 6000, 'inland')
timeSamples(-30000, 21000, 'ocean')
