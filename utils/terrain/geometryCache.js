/**
 * Geometry Cache for Terrain and Water tiles.
 *
 * Tile geometry is fully deterministic: given the same world position, LOD level,
 * and edge-stitch configuration, the output is always identical. Caching avoids
 * rebuilding geometry every time the quadtree LOD churns a tile in and out of the
 * leaf set, and lets this module own disposal instead of TerrainTile doing it on unmount.
 *
 * Cache key: `${node.key}::${stitchSignature}`
 *   - node.key  encodes lod + centerX + centerZ (from QuadtreeNode constructor)
 *   - stitchSignature is a compact string of the four edge-stitch flags and steps
 *
 * Eviction: simple LRU via Map insertion-order. The oldest unused entry is disposed
 * and deleted whenever the cache grows past MAX_ENTRIES.
 */

// Maximum number of geometry pairs (terrain + water) to keep alive.
// ~2× the maximum visible leaf count (QUADTREE_VIEW_RANGE=5 → ~77 leaves).
const MAX_ENTRIES = 200

// Map preserves insertion order, which gives us free LRU tracking:
// on a cache hit we delete and re-insert to move the entry to the tail.
const _cache = new Map()

/**
 * Return a compact string that uniquely identifies an edgeStitchInfo value.
 * Called once per hook invocation so it must be cheap.
 *
 * Format: "N<0|1><step>S<0|1><step>E<0|1><step>W<0|1><step>"
 */
export function stitchSignature(edgeStitchInfo) {
	const { north, south, east, west } = edgeStitchInfo
	return `N${north.needsStitch ? 1 : 0}${north.neighborStep}S${south.needsStitch ? 1 : 0}${south.neighborStep}E${east.needsStitch ? 1 : 0}${east.neighborStep}W${west.needsStitch ? 1 : 0}${west.neighborStep}`
}

/**
 * Look up or build a geometry pair for the given cache key.
 *
 * @param {string} key - Unique string combining node.key and stitchSignature
 * @param {() => { terrainGeometry, waterGeometry }} buildFn - Called only on cache miss
 * @returns {{ terrainGeometry: THREE.BufferGeometry, waterGeometry: THREE.BufferGeometry|null }}
 */
export function getCachedGeometry(key, buildFn) {
	if (_cache.has(key)) {
		// Promote to most-recently-used by moving to tail
		const entry = _cache.get(key)
		_cache.delete(key)
		_cache.set(key, entry)
		return entry
	}

	const entry = buildFn()
	_cache.set(key, entry)

	// Evict the least-recently-used entry (Map head) if over cap
	if (_cache.size > MAX_ENTRIES) {
		const lruKey = _cache.keys().next().value
		_disposeEntry(_cache.get(lruKey))
		_cache.delete(lruKey)
	}

	return entry
}

/**
 * Dispose all cached geometries and empty the cache.
 * Call this whenever terrainHelpers changes (new noise seed) so stale geometry
 * is not returned for keys that will be re-used with different height data.
 */
export function clearGeometryCache() {
	for (const entry of _cache.values()) {
		_disposeEntry(entry)
	}
	_cache.clear()
}

function _disposeEntry({ terrainGeometry, waterGeometry }) {
	terrainGeometry.dispose()
	waterGeometry?.dispose()
}
