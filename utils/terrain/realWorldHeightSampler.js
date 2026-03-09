/**
 * Real-world terrain height sampler.
 *
 * Drop-in replacement for utils/terrain/heightSampler.js.
 * Implements the same terrainHelpers interface expected by:
 *   - useTerrainGeometry  (getHeight, getNormal, getFlow)
 *   - TerrainCollider      (getHeight, getNormal)
 *   - useVehiclePhysics    (getHeight)
 *   - vegetationGeneration (getHeight, getNormal, isWater)
 *   - Buoyancy / water     (isWater)
 *
 * Height data comes from an ElevationProvider backed by AWS Terrarium tiles.
 * The provider uses a fallback chain (preferred zoom → coarser zooms) so
 * getHeight() always returns a value even while high-res tiles are loading.
 */

import { Vector3 } from 'three'
import { worldToLatLng } from './geoProjection.js'

// Epsilon for numerical gradient (metres). Fine-grained enough to detect
// realistic slopes without introducing noise from tile pixel boundaries.
const GRADIENT_EPSILON = 2.0

/**
 * Create terrain helper functions backed by real-world elevation data.
 *
 * @param {import('./tileProviders/ElevationProvider').ElevationProvider} elevationProvider
 * @param {{ lat: number, lng: number }} geoOrigin  - World-space origin
 * @param {number} [defaultLod=0]  - Default LOD used to pick zoom for height queries.
 *   Callers that know their LOD (e.g. geometry builders) should use getHeightAtLod().
 * @returns {object} terrainHelpers
 */
export const createTerrainHelpers = (elevationProvider, geoOrigin, dataVersion = 0, defaultLod = 0) => {
	const defaultZoom = elevationProvider.zoomForLod(defaultLod)

	/**
	 * Get terrain height (game units) at any world XZ position.
	 * Synchronous — relies on tiles already being loaded.
	 * Falls back to coarser zoom levels gracefully.
	 *
	 * @param {number} worldX
	 * @param {number} worldZ
	 * @param {number} [zoom] - Override zoom level (e.g. pass LOD-specific zoom)
	 * @returns {number} height in game units (metres by default)
	 */
	const getHeight = (worldX, worldZ, zoom = defaultZoom) => {
		const { lat, lng } = worldToLatLng(worldX, worldZ, geoOrigin)
		const elevation = elevationProvider.getElevation(lat, lng, zoom)
		// getElevation returns null only if no tile at any zoom is loaded.
		// This should only happen briefly before the first prefetch completes.
		return elevation ?? 0
	}

	/**
	 * Get the surface normal at a world XZ position using finite differences.
	 *
	 * @param {number} worldX
	 * @param {number} worldZ
	 * @param {Vector3} [target]
	 * @param {number} [zoom]
	 * @returns {Vector3}
	 */
	const getNormal = (worldX, worldZ, target = new Vector3(), zoom = defaultZoom) => {
		const hL = getHeight(worldX - GRADIENT_EPSILON, worldZ, zoom)
		const hR = getHeight(worldX + GRADIENT_EPSILON, worldZ, zoom)
		const hD = getHeight(worldX, worldZ - GRADIENT_EPSILON, zoom)
		const hU = getHeight(worldX, worldZ + GRADIENT_EPSILON, zoom)
		const dhdx = (hR - hL) / (2 * GRADIENT_EPSILON)
		const dhdz = (hU - hD) / (2 * GRADIENT_EPSILON)
		return target.set(-dhdx, 1, -dhdz).normalize()
	}

	/**
	 * Whether a world position is below sea level (height < 0).
	 * Coastlines are automatic — no special configuration needed.
	 */
	const isWater = (worldX, worldZ) => {
		return getHeight(worldX, worldZ) < 0
	}

	/**
	 * River flow direction and strength.
	 * TODO: query a WaterwayProvider (OSM) for real river data.
	 * Returns zero-flow everywhere until then — water geometry will render
	 * as still water with no directional current.
	 */
	const getFlow = () => ({
		direction: { x: 0, z: 1 },
		strength: 0,
		velocity: 0,
	})

	/**
	 * LOD-aware height query. Geometry builders can call this with the
	 * tile's LOD level to use the appropriate elevation zoom level.
	 *
	 * @param {number} worldX
	 * @param {number} worldZ
	 * @param {number} lodLevel
	 * @returns {number}
	 */
	const getHeightAtLod = (worldX, worldZ, lodLevel) => {
		return getHeight(worldX, worldZ, elevationProvider.zoomForLod(lodLevel))
	}

	return {
		getHeight,
		getNormal,
		isWater,
		getFlow,
		getHeightAtLod,
		// Expose origin and provider for downstream utilities
		geoOrigin,
		elevationProvider,
		// Versioned so useTerrainGeometry can include it in the cache key,
		// enabling no-flash geometry upgrades when new elevation tiles arrive.
		_dataVersion: dataVersion,
	}
}
