/**
 * Base class for geographic tile data providers.
 *
 * Cache architecture — three tiers, checked in order:
 *   1. Memory   — LRU Map of decoded data; fast, capped at memoryCap entries
 *   2. IndexedDB — raw ArrayBuffer bytes; persists across page loads
 *   3. Server proxy — fetches from upstream once and caches to disk permanently
 *
 * Subclasses must implement:
 *   async decode(arrayBuffer) → decodedData
 *
 * Subclasses may override:
 *   getUrl(z, x, y) if the URL pattern differs from the default.
 */

const IDB_DB_NAME = '4x4builder-tiles'
const IDB_VERSION = 1

// Shared IndexedDB connection (one per page load, across all provider instances)
let _idbPromise = null

function openIDB() {
	if (!_idbPromise) {
		_idbPromise = new Promise((resolve, reject) => {
			const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION)
			req.onupgradeneeded = (e) => e.target.result.createObjectStore('tiles')
			req.onsuccess = (e) => resolve(e.target.result)
			req.onerror = () => reject(req.error)
		})
	}
	return _idbPromise
}

function idbGet(db, key) {
	return new Promise((resolve, reject) => {
		const req = db.transaction('tiles', 'readonly').objectStore('tiles').get(key)
		req.onsuccess = () => resolve(req.result ?? null)
		req.onerror = () => reject(req.error)
	})
}

function idbPut(db, key, value) {
	return new Promise((resolve, reject) => {
		const req = db.transaction('tiles', 'readwrite').objectStore('tiles').put(value, key)
		req.onsuccess = () => resolve()
		req.onerror = () => reject(req.error)
	})
}

export class TileProvider {
	/**
	 * @param {object} options
	 * @param {string} options.type       - Tile type string, e.g. 'elevation'. Used as IDB key prefix.
	 * @param {string} options.serverBase - Base URL for tile requests, e.g. '/tiles'
	 * @param {number} [options.memoryCap=300] - Max entries kept in the in-process LRU cache
	 */
	constructor({ type, serverBase, memoryCap = 300 }) {
		this.type = type
		this.serverBase = serverBase
		this.memoryCap = memoryCap
		// LRU memory cache — Map preserves insertion order, so the head is always the LRU entry
		this._mem = new Map()
		// In-flight fetch promises keyed by tile key — prevents duplicate simultaneous fetches
		this._inflight = new Map()
	}

	// ---------------------------------------------------------------------------
	// Subclass interface
	// ---------------------------------------------------------------------------

	/**
	 * Decode a raw ArrayBuffer returned by the server into whatever structure
	 * this provider stores in the memory cache.
	 * May return a Promise.
	 *
	 * @param {ArrayBuffer} arrayBuffer
	 * @returns {any | Promise<any>}
	 */
	// eslint-disable-next-line no-unused-vars
	async decode(arrayBuffer) {
		throw new Error(`${this.constructor.name}.decode() not implemented`)
	}

	/**
	 * Build the fetch URL for a tile. Override to customise.
	 */
	getUrl(z, x, y) {
		return `${this.serverBase}/${this.type}/${z}/${x}/${y}`
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * Synchronously return decoded tile data if it is already in the memory cache.
	 * Returns null if not loaded — call fetchTile() to load it.
	 *
	 * @param {number} z
	 * @param {number} x
	 * @param {number} y
	 * @returns {any|null}
	 */
	getTile(z, x, y) {
		const key = this._key(z, x, y)
		if (!this._mem.has(key)) return null
		// Promote to MRU tail
		const data = this._mem.get(key)
		this._mem.delete(key)
		this._mem.set(key, data)
		return data
	}

	/**
	 * Whether a tile is present in the in-process memory cache.
	 */
	isCached(z, x, y) {
		return this._mem.has(this._key(z, x, y))
	}

	/**
	 * Asynchronously fetch a tile, checking memory → IndexedDB → server in order.
	 * Concurrent calls for the same tile share a single in-flight request.
	 *
	 * @param {number} z
	 * @param {number} x
	 * @param {number} y
	 * @returns {Promise<any>} Resolves with decoded tile data
	 */
	async fetchTile(z, x, y) {
		const key = this._key(z, x, y)

		// Tier 1: memory (sync fast-path)
		if (this._mem.has(key)) {
			return this.getTile(z, x, y)
		}

		// Deduplicate concurrent fetches for the same tile
		if (this._inflight.has(key)) {
			return this._inflight.get(key)
		}

		const promise = this._loadTile(z, x, y, key).finally(() => {
			this._inflight.delete(key)
		})
		this._inflight.set(key, promise)
		return promise
	}

	/**
	 * Pre-fetch all tiles covering a geographic bounding box at a given zoom level.
	 * Resolves when all tiles are loaded (failures are logged but don't reject).
	 *
	 * @param {number} northLat
	 * @param {number} southLat
	 * @param {number} westLng
	 * @param {number} eastLng
	 * @param {number} zoom
	 * @returns {Promise<boolean>} true if any tiles were newly fetched from network/IDB,
	 *   false if all were already in the memory cache (no new data — no rebuild needed).
	 */
	async prefetch(northLat, southLat, westLng, eastLng, zoom) {
		const { latLngToTile } = await import('../geoProjection.js')
		const tl = latLngToTile(northLat, westLng, zoom)
		const br = latLngToTile(southLat, eastLng, zoom)

		const fetches = []
		for (let x = tl.x; x <= br.x; x++) {
			for (let y = tl.y; y <= br.y; y++) {
				if (!this.isCached(zoom, x, y)) {
					fetches.push(
						this.fetchTile(zoom, x, y).catch((err) =>
							console.warn(`[${this.type}] prefetch failed z${zoom}/${x}/${y}:`, err.message)
						)
					)
				}
			}
		}
		await Promise.all(fetches)
		// Return whether any new tiles were actually loaded (vs pure cache hits)
		return fetches.length > 0
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	_key(z, x, y) {
		return `${this.type}:${z}/${x}/${y}`
	}

	async _loadTile(z, x, y, key) {
		// Tier 2: IndexedDB
		try {
			const db = await openIDB()
			const raw = await idbGet(db, key)
			if (raw) {
				const decoded = await this.decode(raw, z, x, y)
				this._store(key, decoded)
				return decoded
			}
		} catch (_) {
			// IDB unavailable (e.g. private browsing) — proceed to network
		}

		// Tier 3: server proxy → disk cache
		const response = await fetch(this.getUrl(z, x, y))
		if (!response.ok) {
			throw new Error(`[${this.type}] HTTP ${response.status} for ${this.getUrl(z, x, y)}`)
		}
		const buffer = await response.arrayBuffer()

		// Fire-and-forget IDB write — don't block on it
		openIDB()
			.then((db) => idbPut(db, key, buffer))
			.catch(() => {})

		const decoded = await this.decode(buffer, z, x, y)
		this._store(key, decoded)
		return decoded
	}

	_store(key, data) {
		this._mem.set(key, data)
		// LRU eviction — Map head is oldest
		if (this._mem.size > this.memoryCap) {
			this._mem.delete(this._mem.keys().next().value)
		}
	}
}
