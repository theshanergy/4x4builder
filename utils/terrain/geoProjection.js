/**
 * Geographic projection utilities for converting between:
 *   - World coordinates (meters, Three.js space)
 *   - Geographic coordinates (latitude / longitude)
 *   - Slippy-map tile coordinates (z / x / y)
 *
 * Coordinate conventions:
 *   World +X = East
 *   World +Z = South  (matches Three.js default where camera faces -Z = North)
 *   World  Y = elevation (meters, positive up)
 *
 * Projection: equirectangular approximation around the world origin.
 * Accurate to < 0.5% across a 50 km radius at any latitude — sufficient for gameplay.
 */

const METERS_PER_DEGREE_LAT = 111320 // constant; 1° lat ≈ 111.32 km

/**
 * Metres per degree of longitude at a given latitude.
 */
function metersPerDegreeLng(originLat) {
	return METERS_PER_DEGREE_LAT * Math.cos((originLat * Math.PI) / 180)
}

// ---------------------------------------------------------------------------
// World ↔ Lat/Lng
// ---------------------------------------------------------------------------

/**
 * Convert geographic coordinates to world-space XZ (meters from origin).
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{ lat: number, lng: number }} origin - World origin in geographic space
 * @returns {{ x: number, z: number }}
 */
export function latLngToWorld(lat, lng, origin) {
	return {
		x: (lng - origin.lng) * metersPerDegreeLng(origin.lat),
		z: (origin.lat - lat) * METERS_PER_DEGREE_LAT,
	}
}

/**
 * Convert world-space XZ back to geographic coordinates.
 *
 * @param {number} worldX
 * @param {number} worldZ
 * @param {{ lat: number, lng: number }} origin
 * @returns {{ lat: number, lng: number }}
 */
export function worldToLatLng(worldX, worldZ, origin) {
	return {
		lat: origin.lat - worldZ / METERS_PER_DEGREE_LAT,
		lng: origin.lng + worldX / metersPerDegreeLng(origin.lat),
	}
}

// ---------------------------------------------------------------------------
// Slippy-map tile math
// ---------------------------------------------------------------------------

/**
 * Convert lat/lng to slippy-map tile coordinates at a given zoom level.
 * Also returns fractional position within the tile (0..1 each axis, top-left origin).
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} zoom - Integer zoom level
 * @returns {{ x: number, y: number, fracX: number, fracY: number }}
 */
export function latLngToTile(lat, lng, zoom) {
	const n = Math.pow(2, zoom)
	const latRad = (lat * Math.PI) / 180
	const rawX = ((lng + 180) / 360) * n
	const rawY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
	const x = Math.floor(rawX)
	const y = Math.floor(rawY)
	return { x, y, fracX: rawX - x, fracY: rawY - y }
}

/**
 * Get the geographic bounding box (lat/lng) of a tile.
 *
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} zoom
 * @returns {{ north: number, south: number, west: number, east: number }}
 */
export function tileToBounds(tileX, tileY, zoom) {
	const n = Math.pow(2, zoom)
	const west = (tileX / n) * 360 - 180
	const east = ((tileX + 1) / n) * 360 - 180
	const northRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / n)))
	const southRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (tileY + 1)) / n)))
	return {
		north: (northRad * 180) / Math.PI,
		south: (southRad * 180) / Math.PI,
		west,
		east,
	}
}

/**
 * Approximate tile width in meters at a tile's center latitude.
 *
 * @param {number} tileY
 * @param {number} zoom
 * @returns {number} metres
 */
export function tileSizeMeters(tileY, zoom) {
	const n = Math.pow(2, zoom)
	const centerLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY + 1) / n)))
	return (40075016.686 * Math.cos(centerLatRad)) / n
}

// ---------------------------------------------------------------------------
// LOD → zoom mapping
// ---------------------------------------------------------------------------

/**
 * Recommended elevation tile zoom level for a game LOD level.
 * Imported from GEO_CONFIG.lodZoomLevels at call-site to avoid a circular
 * dependency; callers should pass the array directly.
 *
 * @param {number} lodLevel - Game LOD (0 = highest detail, 7 = lowest)
 * @param {number[]} lodZoomLevels - Array indexed by LOD (from GEO_CONFIG)
 * @returns {number} zoom
 */
export function getElevationZoom(lodLevel, lodZoomLevels) {
	return lodZoomLevels[Math.min(Math.max(lodLevel, 0), lodZoomLevels.length - 1)]
}
