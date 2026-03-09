/**
 * Geographic configuration for real-world terrain.
 *
 * Tile server URL:
 *   Production   → Netlify edge function at /tiles (same origin, CDN-cached globally)
 *   Development  → Vite proxies /tiles/* to localhost:8080 (no env var needed)
 *
 * No VITE_TILE_SERVER_URL env var is needed in production any more. The tile
 * proxy now runs as a Netlify edge function on the same domain, so requests
 * go to /tiles/... and are cached at Netlify's CDN edge globally.
 *
 * To use the old Render.com proxy instead (e.g. for a non-Netlify deploy),
 * set VITE_TILE_SERVER_URL to your server base URL.
 */

// In production: same-origin /tiles (Netlify edge function + CDN)
// In dev: Vite proxies /tiles/* → localhost:8080 (server/src/TileProxy.js)
// Override with VITE_TILE_SERVER_URL for non-Netlify deployments.
const TILE_SERVER_BASE = import.meta.env.VITE_TILE_SERVER_URL
	? `${import.meta.env.VITE_TILE_SERVER_URL}/tiles`
	: '/tiles'

const GEO_CONFIG = {
	// Default spawn origin
	defaultOrigin: { lat: 49.6978, lng: -123.1630, name: 'Squamish, BC' },

	// Named presets available via ?preset=<name> URL param
	presets: [
		{ name: 'Moab, Utah', lat: 38.5733, lng: -109.5498 },
		{ name: 'Mt. Whitney, CA', lat: 36.5786, lng: -118.2923 },
		{ name: 'Death Valley, CA', lat: 36.5054, lng: -117.0794 },
		{ name: 'Scottish Highlands', lat: 57.1, lng: -4.7 },
		{ name: 'Iceland', lat: 65.0, lng: -18.5 },
		{ name: 'Swiss Alps', lat: 46.4, lng: 8.0 },
		{ name: 'Sahara Desert', lat: 23.4162, lng: 25.6628 },
		{ name: 'Grand Canyon, AZ', lat: 36.0544, lng: -112.1401 },
	],

	// Base URL for tile requests
	tileServerBase: TILE_SERVER_BASE,

	// Vertical scale: game units per elevation meter (1.0 = 1:1)
	verticalScale: 1.0,

	// Elevation tile zoom level per game LOD level.
	// LOD 0 = smallest tiles (32 m, highest detail) → zoom 14 (~9.5 m/px)
	// LOD 7 = largest tiles (4096 m, lowest detail) → zoom  9 (~305 m/px)
	// Index = LOD level (0–7)
	lodZoomLevels: [14, 14, 14, 13, 12, 11, 10, 9],

	// Zoom levels to pre-warm on startup, coarsest → finest.
	// This ensures every tile has at least a fallback before high-res loads.
	warmupZooms: [9, 11, 14],
}

export default GEO_CONFIG
