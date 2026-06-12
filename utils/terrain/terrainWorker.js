// Web Worker entry for terrain/vegetation generation. See generationJobs.js
// for the job kinds. Loaded by workerPool.js via `new Worker(new URL(...))`
// so Vite bundles it as a module worker.

import { createJobExecutor } from './generationJobs'

const executor = createJobExecutor()

self.onmessage = (event) => {
	const { id, kind, payload } = event.data
	try {
		const { result, transferables } = executor.execute(kind, payload)
		self.postMessage({ id, ok: true, result }, transferables)
	} catch (error) {
		self.postMessage({ id, ok: false, error: String(error?.stack || error) })
	}
}
