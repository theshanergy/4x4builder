import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

import { createTerrainHelpers } from '../../../../utils/terrain/realWorldHeightSampler'
import { ElevationProvider } from '../../../../utils/terrain/tileProviders/ElevationProvider'
import { clearVegetationCache } from '../../../../utils/terrain/vegetationGeneration'
import { worldToLatLng } from '../../../../utils/terrain/geoProjection'
import useTerrainQuadtree from '../../../../hooks/useTerrainQuadtree'
import useWaterMaterial from '../../../../hooks/useWaterMaterial'
import useTerrainMaterial from '../../../../hooks/useTerrainMaterial'
import useVegetation from '../../../../hooks/useVegetation'
import useGameStore from '../../../../store/gameStore'
import GEO_CONFIG from '../../../../config/geo'
import { QUADTREE_VIEW_RANGE, QUADTREE_ROOT_SIZE } from '../../../../config/lod'
import TerrainCollider from './TerrainCollider'
import TerrainTile from './TerrainTile'

// ---------------------------------------------------------------------------
// Resolve geographic origin from URL search params or GEO_CONFIG defaults
// ---------------------------------------------------------------------------

function resolveOrigin(searchParams) {
	// Explicit coordinates: ?lat=38.57&lng=-109.55
	const lat = parseFloat(searchParams.get('lat'))
	const lng = parseFloat(searchParams.get('lng'))
	if (!isNaN(lat) && !isNaN(lng)) {
		return { lat, lng, name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
	}

	// Named preset: ?preset=Iceland  (case-insensitive)
	const presetName = searchParams.get('preset')
	if (presetName) {
		const preset = GEO_CONFIG.presets.find((p) => p.name.toLowerCase() === presetName.toLowerCase())
		if (preset) return preset
	}

	return GEO_CONFIG.defaultOrigin
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function boundsAround(origin, radiusMeters) {
	const degLat = radiusMeters / 111320
	const degLng = radiusMeters / (111320 * Math.cos((origin.lat * Math.PI) / 180))
	return {
		northLat: origin.lat + degLat,
		southLat: origin.lat - degLat,
		westLng: origin.lng - degLng,
		eastLng: origin.lng + degLng,
	}
}

// Compute lat/lng bounding box covering all visible leaf tiles
function leafBounds(leafTiles, origin) {
	let minX = Infinity,
		maxX = -Infinity,
		minZ = Infinity,
		maxZ = -Infinity

	for (const { node } of leafTiles) {
		const half = node.size / 2
		minX = Math.min(minX, node.centerX - half)
		maxX = Math.max(maxX, node.centerX + half)
		minZ = Math.min(minZ, node.centerZ - half)
		maxZ = Math.max(maxZ, node.centerZ + half)
	}

	// minZ = most-north corner (+Z points south in our coord system)
	const nw = worldToLatLng(minX, minZ, origin)
	const se = worldToLatLng(maxX, maxZ, origin)
	return { northLat: nw.lat, southLat: se.lat, westLng: nw.lng, eastLng: se.lng }
}

// ---------------------------------------------------------------------------
// Main terrain component
// ---------------------------------------------------------------------------

const Terrain = () => {
	const [searchParams] = useSearchParams()

	// Origin is fixed for the lifetime of this component instance
	const geoOrigin = useMemo(() => resolveOrigin(searchParams), []) // eslint-disable-line

	// Single ElevationProvider — owns all tile memory/IDB caching
	const elevationProvider = useMemo(
		() =>
			new ElevationProvider({
				serverBase: GEO_CONFIG.tileServerBase,
				verticalScale: GEO_CONFIG.verticalScale,
				lodZoomLevels: GEO_CONFIG.lodZoomLevels,
			}),
		[] // eslint-disable-line
	)

	// Incrementing dataVersion forces terrainHelpers to be a new object.
	// useTerrainGeometry depends on terrainHelpers by reference, so a new object
	// causes every tile's geometry useMemo to miss and rebuild.
	const [dataVersion, setDataVersion] = useState(0)
	const [tilesReady, setTilesReady] = useState(false)

	// Coalesce rapid successive tile loads into one geometry version bump.
	// We do NOT clear the geometry cache here — old geometry entries stay alive
	// under their versioned cache keys so Three.js can keep rendering them until
	// React commits the new (upgraded) geometry built under the next version key.
	// Old entries are LRU-evicted naturally by the geometry cache (cap = 200).
	const rebuildTimer = useRef(null)
	const scheduleRebuild = useCallback(() => {
		clearTimeout(rebuildTimer.current)
		rebuildTimer.current = setTimeout(() => {
			setDataVersion((v) => v + 1)
		}, 50)
	}, [])

	// -----------------------------------------------------------------------
	// Startup warmup: fetch coarse → fine zoom levels before first render.
	// GEO_CONFIG.warmupZooms = [9, 11, 14] — coarsest first so there is
	// always a fallback elevation available for getHeight() calls.
	// -----------------------------------------------------------------------
	useEffect(() => {
		let cancelled = false

		async function warmup() {
			// Cover the entire view frustum at spawn (half-diagonal of the visible root grid)
			const bounds = boundsAround(geoOrigin, QUADTREE_VIEW_RANGE * QUADTREE_ROOT_SIZE * 0.5)

			for (const zoom of GEO_CONFIG.warmupZooms) {
				if (cancelled) return
				try {
					await elevationProvider.prefetch(
						bounds.northLat,
						bounds.southLat,
						bounds.westLng,
						bounds.eastLng,
						zoom
					)
					if (!cancelled) scheduleRebuild()
				} catch (err) {
					console.warn('[Terrain] warmup prefetch error at zoom', zoom, err.message)
				}
			}

			if (!cancelled) setTilesReady(true)
		}

		warmup()
		return () => {
			cancelled = true
			clearTimeout(rebuildTimer.current)
		}
	}, []) // eslint-disable-line react-hooks/exhaustive-deps

	// -----------------------------------------------------------------------
	// terrainHelpers: recreated on every dataVersion bump.
	// This is cheap (thin wrapper around elevationProvider) and is the
	// mechanism by which geometry rebuilds are triggered after tile loads.
	// -----------------------------------------------------------------------
	const terrainHelpers = useMemo(
		() => createTerrainHelpers(elevationProvider, geoOrigin, dataVersion),
		[elevationProvider, geoOrigin, dataVersion] // eslint-disable-line react-hooks/exhaustive-deps
	)

	// Publish into game store so physics / vehicle hooks can query terrain
	useEffect(() => {
		useGameStore.getState().setTerrainHelpers(tilesReady ? terrainHelpers : null)
		useGameStore.getState().setGeoOrigin(geoOrigin)
		return () => {
			useGameStore.getState().setTerrainHelpers(null)
		}
	}, [terrainHelpers, geoOrigin, tilesReady])

	// Vegetation cell cache is keyed on world position — only needs clearing when the
	// geographic origin changes, not on every elevation tile refinement.
	useEffect(() => {
		clearVegetationCache()
	}, [geoOrigin])

	// -----------------------------------------------------------------------
	// Quadtree LOD drives the visible leaf set
	// -----------------------------------------------------------------------
	const leafTiles = useTerrainQuadtree()

	// -----------------------------------------------------------------------
	// Progressive prefetch: as the camera moves into new areas, fetch
	// elevation tiles for the current leaf set at their appropriate zoom levels.
	// -----------------------------------------------------------------------
	useEffect(() => {
		if (!tilesReady || leafTiles.length === 0) return

		// Group leaf nodes by their zoom level so each prefetch covers only the
		// tiles actually needed at that resolution — avoids over-fetching coarse
		// zoom tiles across the entire leaf extent.
		const nodesByZoom = new Map()
		for (const leaf of leafTiles) {
			const zoom = elevationProvider.zoomForLod(leaf.node.lod)
			if (!nodesByZoom.has(zoom)) nodesByZoom.set(zoom, [])
			nodesByZoom.get(zoom).push(leaf)
		}

		for (const [zoom, nodes] of nodesByZoom) {
			const bounds = leafBounds(nodes, geoOrigin)
			elevationProvider
				.prefetch(bounds.northLat, bounds.southLat, bounds.westLng, bounds.eastLng, zoom)
				.then((hasNewTiles) => {
					// Only rebuild geometry when genuinely new tiles were loaded.
					// Cache hits (tiles already in memory) return false — no rebuild needed.
					if (hasNewTiles) scheduleRebuild()
				})
				.catch((err) => console.warn('[Terrain] progressive prefetch error at zoom', zoom, err.message))
		}
	}, [leafTiles]) // eslint-disable-line react-hooks/exhaustive-deps

	// -----------------------------------------------------------------------
	// Shared materials and vegetation models (unchanged from before)
	// -----------------------------------------------------------------------
	const terrainMaterial = useTerrainMaterial()
	const waterMaterial = useWaterMaterial()
	const vegetationModels = useVegetation()

	// Hold rendering until at least the coarsest zoom tiles are present
	if (!tilesReady) return null

	return (
		<group name='Terrain'>
			<TerrainCollider terrainHelpers={terrainHelpers} />
			{leafTiles.map(({ node, edgeStitchInfo }) => (
				<TerrainTile
					key={node.key}
					node={node}
					terrainHelpers={terrainHelpers}
					edgeStitchInfo={edgeStitchInfo}
					terrainMaterial={terrainMaterial}
					waterMaterial={waterMaterial}
					vegetationModels={vegetationModels}
				/>
			))}
		</group>
	)
}

export default Terrain
