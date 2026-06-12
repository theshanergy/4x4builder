import { useState, useRef, useEffect, startTransition } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, BufferAttribute } from 'three'

import { QUADTREE_ROOT_SIZE, QUADTREE_MIN_SIZE, LOD_SPLIT_FACTOR, LOD_HYSTERESIS, MAX_QUADTREE_DEPTH, QUADTREE_VIEW_RANGE } from '../config/lod'
import { QuadtreeNode, getEdgeStitchInfo } from '../utils/terrain/quadtree'
import { TERRAIN_INDICES, WATER_NORMALS, WATER_FLOW_DIRS, USE_ROAD_ATTRIBUTES, USE_CLIMATE_ATTRIBUTES } from '../utils/terrain/tileGeometryBuilder'
import { getTerrainWorkerPool } from '../utils/terrain/workerPool'
import { vehicleState } from '../store/gameStore'

// Geometry cache headroom beyond the ~350 visible tiles, so LOD hysteresis
// (drive forward, reverse) reuses geometry instead of rebuilding.
const GEOMETRY_CACHE_LIMIT = 800
// While tiles are missing (e.g. a worker job failed), re-request this often.
const RETRY_INTERVAL = 0.5

const stitchSig = (e) =>
	`${e.north.needsStitch ? e.north.neighborStep : 0}|${e.south.needsStitch ? e.south.neighborStep : 0}|` +
	`${e.east.needsStitch ? e.east.neighborStep : 0}|${e.west.needsStitch ? e.west.neighborStep : 0}`

/**
 * Wrap raw tile arrays (from the generation worker) into three.js geometries.
 * Pure assembly — no terrain sampling happens on the main thread.
 */
const assembleTileGeometry = (arrays) => {
	const terrainGeometry = new BufferGeometry()
	terrainGeometry.setAttribute('position', new BufferAttribute(arrays.positions, 3))
	terrainGeometry.setAttribute('normal', new BufferAttribute(arrays.normals, 3))
	terrainGeometry.setAttribute('uv', new BufferAttribute(arrays.uvs, 2))
	if (USE_ROAD_ATTRIBUTES) {
		terrainGeometry.setAttribute('roadWeights', new BufferAttribute(arrays.roadWeights, 4))
		terrainGeometry.setAttribute('roadParams', new BufferAttribute(arrays.roadParams, 4))
	}
	if (USE_CLIMATE_ATTRIBUTES) {
		terrainGeometry.setAttribute('climate', new BufferAttribute(arrays.climateAttr, 4))
	}
	terrainGeometry.setIndex(new BufferAttribute(TERRAIN_INDICES, 1))

	let waterGeometry = null
	if (arrays.water) {
		const { positions, depths, indices } = arrays.water
		waterGeometry = new BufferGeometry()
		waterGeometry.setAttribute('position', new BufferAttribute(positions, 3))
		waterGeometry.setAttribute('normal', new BufferAttribute(WATER_NORMALS, 3))
		waterGeometry.setAttribute('uv', new BufferAttribute(arrays.uvs, 2)) // Reuse terrain UVs
		waterGeometry.setAttribute('waterWorldPosition', new BufferAttribute(arrays.uvs, 2))
		waterGeometry.setAttribute('depth', new BufferAttribute(depths, 1))
		waterGeometry.setAttribute('flowDir', new BufferAttribute(WATER_FLOW_DIRS, 2)) // Reserved for spline-derived flow
		// null indices = fully underwater tile, reuse the shared full-tile index buffer
		waterGeometry.setIndex(new BufferAttribute(indices ?? TERRAIN_INDICES, 1))
	}

	return { terrainGeometry, waterGeometry, heightCache: arrays.heightCache }
}

const disposeEntry = (entry) => {
	entry.geometry.terrainGeometry.dispose()
	entry.geometry.waterGeometry?.dispose()
}

const rootKeyForNode = (node) => `${Math.floor(node.centerX / QUADTREE_ROOT_SIZE)},${Math.floor(node.centerZ / QUADTREE_ROOT_SIZE)}`

/**
 * Quadtree terrain tile streaming.
 *
 * Each frame (throttled) the quadtree is refined around the camera/vehicle on
 * the main thread (cheap), but tile vertex generation — the expensive part —
 * runs in the worker pool. Published tiles swap atomically:
 *  - while driving, the previous tile set keeps rendering until every tile of
 *    the new set is ready (no holes, no overlaps, stale LOD for a few frames
 *    at worst);
 *  - during the initial load, tiles reveal progressively per quadtree root,
 *    nearest jobs first.
 * Geometry is cached by (tile key, stitch signature) so revisited LOD
 * configurations remount instantly without regeneration.
 *
 * @returns {Array} renderable tiles: { node, geometry: { terrainGeometry, waterGeometry, heightCache } }
 */
const useTerrainTiles = () => {
	const [renderTiles, setRenderTiles] = useState([])
	const stateRef = useRef(null)
	if (!stateRef.current) {
		stateRef.current = {
			roots: new Map(),
			lastUpdatePos: { x: null, z: null },
			lastVehiclePos: { x: null, z: null },
			lastUpdateTime: 0,
			lastRetryTime: 0,
			cache: new Map(), // cacheKey -> { geometry, node }
			pending: new Map(), // cacheKey -> pool job handle
			desired: [], // [{ node, edgeStitchInfo, cacheKey, rootKey, distSq }]
			desiredKeys: new Set(),
			publishedKeys: new Set(),
			initialStream: true,
		}
	}

	// Dispose all cached geometry when the terrain unmounts
	useEffect(() => {
		const s = stateRef.current
		return () => {
			for (const [, handle] of s.pending) handle.cancel()
			s.pending.clear()
			for (const [, entry] of s.cache) disposeEntry(entry)
			s.cache.clear()
		}
	}, [])

	const tryPublish = () => {
		const s = stateRef.current

		let publishList = null
		if (s.desired.every((d) => s.cache.has(d.cacheKey))) {
			// Full set ready — atomic swap
			s.initialStream = false
			publishList = s.desired
		} else if (s.initialStream) {
			// Initial load: reveal whole quadtree roots as they complete
			const rootPending = new Set()
			for (const d of s.desired) {
				if (!s.cache.has(d.cacheKey)) rootPending.add(d.rootKey)
			}
			publishList = s.desired.filter((d) => !rootPending.has(d.rootKey))
		} else {
			// Keep the previous consistent set until the new one is complete
			return
		}

		// Skip redundant publishes
		if (publishList.length === s.publishedKeys.size && publishList.every((d) => s.publishedKeys.has(d.cacheKey))) {
			return
		}
		s.publishedKeys = new Set(publishList.map((d) => d.cacheKey))

		const tiles = publishList.map((d) => ({ node: d.node, geometry: s.cache.get(d.cacheKey).geometry }))
		startTransition(() => setRenderTiles(tiles))
	}

	const evictCache = () => {
		const s = stateRef.current
		if (s.cache.size <= GEOMETRY_CACHE_LIMIT) return
		for (const [key, entry] of s.cache) {
			if (s.cache.size <= GEOMETRY_CACHE_LIMIT) break
			if (s.desiredKeys.has(key) || s.publishedKeys.has(key)) continue
			disposeEntry(entry)
			s.cache.delete(key)
		}
	}

	const requestMissing = () => {
		const s = stateRef.current
		const pool = getTerrainWorkerPool()
		for (const d of s.desired) {
			if (s.cache.has(d.cacheKey) || s.pending.has(d.cacheKey)) continue
			const { node, edgeStitchInfo, cacheKey } = d
			const handle = pool.run(
				'tile',
				{ node: { size: node.size, centerX: node.centerX, centerZ: node.centerZ }, edgeStitchInfo },
				d.distSq
			)
			s.pending.set(cacheKey, handle)
			handle.promise.then((arrays) => {
				if (s.pending.get(cacheKey) !== handle) return // superseded/cancelled
				s.pending.delete(cacheKey)
				if (!arrays) return // failed or cancelled — retry tick re-requests if still desired
				s.cache.set(cacheKey, { geometry: assembleTileGeometry(arrays), node: d.node })
				evictCache()
				tryPublish()
			})
		}
	}

	useFrame(({ camera, clock }) => {
		const s = stateRef.current
		const centerPosition = camera.position
		const vehiclePos = vehicleState.position
		const currentTime = clock.getElapsedTime()
		const isFirstUpdate = s.lastUpdatePos.x === null

		// Retry/refresh tick — covers failed worker jobs without movement
		if (!isFirstUpdate && currentTime - s.lastRetryTime > RETRY_INTERVAL) {
			s.lastRetryTime = currentTime
			if (s.desired.some((d) => !s.cache.has(d.cacheKey) && !s.pending.has(d.cacheKey))) {
				requestMissing()
			}
		}

		// Throttle quadtree refinement — at most every 100ms
		if (!isFirstUpdate && currentTime - s.lastUpdateTime < 0.1) return

		// Only update if camera or vehicle moved more than threshold since last update
		const updateThreshold = QUADTREE_MIN_SIZE
		if (!isFirstUpdate) {
			const dx = centerPosition.x - s.lastUpdatePos.x
			const dz = centerPosition.z - s.lastUpdatePos.z
			const vdx = vehiclePos.x - s.lastVehiclePos.x
			const vdz = vehiclePos.z - s.lastVehiclePos.z
			if (Math.sqrt(dx * dx + dz * dz) < updateThreshold && Math.sqrt(vdx * vdx + vdz * vdz) < updateThreshold) {
				return
			}
		}
		s.lastUpdatePos.x = centerPosition.x
		s.lastUpdatePos.z = centerPosition.z
		s.lastVehiclePos.x = vehiclePos.x
		s.lastVehiclePos.z = vehiclePos.z
		s.lastUpdateTime = currentTime

		// --- Refine quadtree roots around the camera ---
		const rootsNeeded = new Set()
		const centerRootX = Math.floor(centerPosition.x / QUADTREE_ROOT_SIZE)
		const centerRootZ = Math.floor(centerPosition.z / QUADTREE_ROOT_SIZE)

		for (let rx = -QUADTREE_VIEW_RANGE; rx <= QUADTREE_VIEW_RANGE; rx++) {
			for (let rz = -QUADTREE_VIEW_RANGE; rz <= QUADTREE_VIEW_RANGE; rz++) {
				if (rx * rx + rz * rz > QUADTREE_VIEW_RANGE * QUADTREE_VIEW_RANGE) continue
				const rootX = (centerRootX + rx) * QUADTREE_ROOT_SIZE + QUADTREE_ROOT_SIZE / 2
				const rootZ = (centerRootZ + rz) * QUADTREE_ROOT_SIZE + QUADTREE_ROOT_SIZE / 2
				const rootKey = `${rootX},${rootZ}`
				rootsNeeded.add(rootKey)
				if (!s.roots.has(rootKey)) {
					s.roots.set(rootKey, new QuadtreeNode(rootX, rootZ, QUADTREE_ROOT_SIZE, MAX_QUADTREE_DEPTH))
				}
			}
		}
		for (const [key] of s.roots) {
			if (!rootsNeeded.has(key)) s.roots.delete(key)
		}

		for (const [, root] of s.roots) {
			root.update(centerPosition.x, centerPosition.z, LOD_SPLIT_FACTOR, LOD_HYSTERESIS, QUADTREE_MIN_SIZE, vehiclePos.x, vehiclePos.z)
		}

		// --- Collect leaves + edge stitching (must be globally consistent) ---
		const allLeaves = []
		const allNodes = new Map()
		for (const [, root] of s.roots) {
			root.collectLeaves(allLeaves, allNodes)
		}

		s.desired = allLeaves.map((node) => {
			const edgeStitchInfo = getEdgeStitchInfo(node, allNodes, QUADTREE_MIN_SIZE)
			const dx = node.centerX - centerPosition.x
			const dz = node.centerZ - centerPosition.z
			return {
				node,
				edgeStitchInfo,
				cacheKey: node.key + '#' + stitchSig(edgeStitchInfo),
				rootKey: rootKeyForNode(node),
				distSq: dx * dx + dz * dz,
			}
		})
		s.desiredKeys = new Set(s.desired.map((d) => d.cacheKey))

		// Cancel stale build requests
		for (const [key, handle] of s.pending) {
			if (!s.desiredKeys.has(key)) {
				handle.cancel()
				s.pending.delete(key)
			}
		}

		requestMissing()
		tryPublish()
	})

	return renderTiles
}

export default useTerrainTiles
