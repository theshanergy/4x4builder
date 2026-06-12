// Worker pool for terrain tile and vegetation chunk generation.
//
// - Jobs are prioritized (lower value = sooner; callers pass squared distance
//   so nearby tiles/vegetation stream in first).
// - Jobs can be cancelled; queued jobs are dropped, in-flight results are
//   discarded. Cancelled (and failed) jobs resolve to null — callers filter.
// - If Workers are unavailable (SSR, tests) or fail to boot, jobs execute on
//   the main thread in small time-sliced batches so the app still works.

import { createJobExecutor } from './generationJobs'

const MAX_WORKERS = 4
const FALLBACK_FRAME_BUDGET_MS = 6

class TerrainWorkerPool {
	constructor() {
		this.queue = [] // pending jobs, kept sorted by priority on dispatch
		this.jobs = new Map() // id -> job record (queued or in-flight)
		this.nextId = 1
		this.workers = []
		this.idleWorkers = []
		this.fallbackExecutor = null
		this.fallbackTimer = null
		this.anyWorkerSucceeded = false

		if (typeof Worker !== 'undefined') {
			const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
			const size = Math.min(MAX_WORKERS, Math.max(1, cores - 2))
			try {
				for (let i = 0; i < size; i++) {
					const worker = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' })
					worker.onmessage = (event) => this._onWorkerMessage(worker, event.data)
					worker.onerror = (event) => this._onWorkerError(worker, event)
					this.workers.push(worker)
					this.idleWorkers.push(worker)
				}
			} catch (error) {
				console.error('[terrainWorkerPool] failed to create workers, using main-thread fallback', error)
				this._disposeWorkers()
			}
		}
	}

	get usingWorkers() {
		return this.workers.length > 0
	}

	/**
	 * Schedule a generation job.
	 * @returns {{ id: number, promise: Promise<Object|null>, cancel: () => void }}
	 */
	run(kind, payload, priority = 0) {
		const id = this.nextId++
		const job = { id, kind, payload, priority, cancelled: false, running: false, resolve: null }
		job.promise = new Promise((resolve) => {
			job.resolve = resolve
		})
		this.jobs.set(id, job)
		this.queue.push(job)
		this._dispatch()
		return {
			id,
			promise: job.promise,
			cancel: () => this.cancel(id),
		}
	}

	cancel(id) {
		const job = this.jobs.get(id)
		if (!job || job.cancelled) return
		job.cancelled = true
		if (!job.running) {
			const index = this.queue.indexOf(job)
			if (index !== -1) this.queue.splice(index, 1)
			this.jobs.delete(id)
			job.resolve(null)
		}
		// in-flight jobs resolve(null) when their worker reports back
	}

	_dispatch() {
		if (!this.usingWorkers) {
			this._scheduleFallback()
			return
		}
		if (this.queue.length === 0 || this.idleWorkers.length === 0) return

		// Lower priority value first (callers pass squared distance)
		this.queue.sort((a, b) => a.priority - b.priority)

		while (this.queue.length > 0 && this.idleWorkers.length > 0) {
			const job = this.queue.shift()
			const worker = this.idleWorkers.pop()
			job.running = true
			worker._currentJobId = job.id
			worker.postMessage({ id: job.id, kind: job.kind, payload: job.payload })
		}
	}

	_onWorkerMessage(worker, data) {
		this.anyWorkerSucceeded = true
		worker._currentJobId = null
		this.idleWorkers.push(worker)

		const job = this.jobs.get(data.id)
		if (job) {
			this.jobs.delete(data.id)
			if (job.cancelled) {
				job.resolve(null)
			} else if (data.ok) {
				job.resolve(data.result)
			} else {
				console.error('[terrainWorkerPool] job failed:', data.error)
				job.resolve(null)
			}
		}
		this._dispatch()
	}

	_onWorkerError(worker, event) {
		console.error('[terrainWorkerPool] worker error:', event?.message || event)
		// If workers never managed to run a single job (e.g. module failed to
		// load), tear them down and fall back to the main thread so the world
		// still streams in.
		if (!this.anyWorkerSucceeded) {
			const inFlight = [...this.jobs.values()].filter((job) => job.running)
			for (const job of inFlight) {
				job.running = false
				if (!this.queue.includes(job)) this.queue.push(job)
			}
			this._disposeWorkers()
			this._scheduleFallback()
		} else if (worker._currentJobId != null) {
			// Re-queue the interrupted job on the surviving workers
			const job = this.jobs.get(worker._currentJobId)
			worker._currentJobId = null
			if (job && !job.cancelled) {
				job.running = false
				this.queue.push(job)
			}
			const index = this.idleWorkers.indexOf(worker)
			if (index === -1) this.idleWorkers.push(worker)
			this._dispatch()
		}
	}

	_disposeWorkers() {
		for (const worker of this.workers) worker.terminate()
		this.workers = []
		this.idleWorkers = []
	}

	_scheduleFallback() {
		if (this.fallbackTimer != null || this.queue.length === 0) return
		this.fallbackExecutor ??= createJobExecutor()
		this.fallbackTimer = setTimeout(() => {
			this.fallbackTimer = null
			const start = performance.now()
			this.queue.sort((a, b) => a.priority - b.priority)
			while (this.queue.length > 0 && performance.now() - start < FALLBACK_FRAME_BUDGET_MS) {
				const job = this.queue.shift()
				this.jobs.delete(job.id)
				if (job.cancelled) {
					job.resolve(null)
					continue
				}
				try {
					job.resolve(this.fallbackExecutor.execute(job.kind, job.payload).result)
				} catch (error) {
					console.error('[terrainWorkerPool] fallback job failed:', error)
					job.resolve(null)
				}
			}
			this._scheduleFallback()
		}, 0)
	}

	dispose() {
		for (const job of this.jobs.values()) {
			job.cancelled = true
			job.resolve(null)
		}
		this.jobs.clear()
		this.queue.length = 0
		if (this.fallbackTimer != null) {
			clearTimeout(this.fallbackTimer)
			this.fallbackTimer = null
		}
		this._disposeWorkers()
	}
}

let sharedPool = null

export const getTerrainWorkerPool = () => {
	sharedPool ??= new TerrainWorkerPool()
	return sharedPool
}
