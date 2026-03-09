/**
 * Tile proxy edge function.
 *
 * Handles: GET /tiles/:type/:z/:x/:y
 *
 * Proxies to upstream tile sources and streams the response through. Netlify
 * caches the response at the nearest edge node on first miss; the function is
 * never invoked again for that tile. Browsers also cache locally for 1 year.
 *
 * Tiles are immutable geographic data — the same z/x/y always returns the
 * same bytes, so there is no expiry concern.
 *
 * Supported tile types:
 *   elevation → AWS Terrarium  https://s3.amazonaws.com/elevation-tiles-prod/terrarium
 */

// 1 year — safe for immutable geographic tiles
const CACHE_TTL = 31536000

const TILES = {
	elevation: {
		upstream: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium',
		ext: 'png',
		contentType: 'image/png',
	},
}

export default async function handler(req) {
	const { pathname } = new URL(req.url)
	const [, , type, z, x, y] = pathname.split('/')

	const tile = TILES[type]
	if (!tile) return new Response(`Unknown tile type: ${type}`, { status: 400 })

	const upstreamRes = await fetch(`${tile.upstream}/${z}/${x}/${y}.${tile.ext}`)
	if (!upstreamRes.ok) {
		return new Response(`Upstream error: ${upstreamRes.status}`, { status: upstreamRes.status })
	}

	return new Response(upstreamRes.body, {
		status: 200,
		headers: {
			'Content-Type': tile.contentType,
			// Browser cache: 1 year
			'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
			// Netlify CDN cache: honour the headers above rather than any platform default
			'Netlify-CDN-Cache-Control': `public, max-age=${CACHE_TTL}, immutable, durable`,
			// CORS: required for OffscreenCanvas / createImageBitmap in the browser
			'Access-Control-Allow-Origin': '*',
		},
	})
}

export const config = {
	path: '/tiles/:type/:z/:x/:y',
	// 'manual' — Netlify respects Cache-Control / Netlify-CDN-Cache-Control headers above
	// rather than applying any automatic caching policy.
	cache: 'manual',
}
