import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'

// Disk cache root. Production: mount Render.com persistent disk at /data.
// Development: ./tile-cache relative to server working directory.
// Override with TILE_CACHE_DIR env var.
const CACHE_DIR = process.env.TILE_CACHE_DIR || path.join(process.cwd(), 'tile-cache')

// Upstream sources per tile type
const UPSTREAM = {
	elevation: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium',
}

// File extension per tile type
const EXTENSIONS = {
	elevation: 'png',
}

// Content-type per tile type
const CONTENT_TYPES = {
	elevation: 'image/png',
}

// URL pattern: /tiles/:type/:z/:x/:y
const TILE_ROUTE = /^\/tiles\/([a-z]+)\/(\d+)\/(\d+)\/(\d+)$/

function fetchBuffer(url) {
	return new Promise((resolve, reject) => {
		const client = url.startsWith('https') ? https : http
		const req = client.get(url, (res) => {
			if (res.statusCode !== 200) {
				res.resume()
				reject(new Error(`HTTP ${res.statusCode} fetching ${url}`))
				return
			}
			const chunks = []
			res.on('data', (chunk) => chunks.push(chunk))
			res.on('end', () => resolve(Buffer.concat(chunks)))
			res.on('error', reject)
		})
		req.on('error', reject)
	})
}

async function serveTile(res, type, z, x, y) {
	const ext = EXTENSIONS[type]
	if (!ext) {
		res.writeHead(404, corsHeaders())
		res.end('Unknown tile type')
		return
	}

	const cacheFile = path.join(CACHE_DIR, type, z, x, `${y}.${ext}`)

	// Serve from disk cache if present — permanent, immutable
	if (fs.existsSync(cacheFile)) {
		res.writeHead(200, {
			...corsHeaders(),
			'Content-Type': CONTENT_TYPES[type],
			'Cache-Control': 'public, max-age=31536000, immutable',
			'X-Cache': 'HIT',
		})
		fs.createReadStream(cacheFile).pipe(res)
		return
	}

	// Fetch from upstream
	const upstreamUrl = `${UPSTREAM[type]}/${z}/${x}/${y}.${ext}`
	try {
		const data = await fetchBuffer(upstreamUrl)

		// Persist to disk (create dirs as needed)
		fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
		fs.writeFileSync(cacheFile, data)

		res.writeHead(200, {
			...corsHeaders(),
			'Content-Type': CONTENT_TYPES[type],
			'Cache-Control': 'public, max-age=31536000, immutable',
			'X-Cache': 'MISS',
		})
		res.end(data)
	} catch (err) {
		console.error(`[TileProxy] Upstream error ${upstreamUrl}:`, err.message)
		res.writeHead(502, corsHeaders())
		res.end('Upstream error')
	}
}

function corsHeaders() {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
	}
}

/**
 * Attempt to handle a tile request. Returns true if the URL matched, false otherwise.
 * Attach to the HTTP server's request handler before WebSocket upgrade.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {boolean} Whether the request was handled
 */
export function handleTileRequest(req, res) {
	const urlPath = req.url?.split('?')[0] ?? ''
	const match = urlPath.match(TILE_ROUTE)
	if (!match) return false

	const [, type, z, x, y] = match

	// CORS preflight
	if (req.method === 'OPTIONS') {
		res.writeHead(204, corsHeaders())
		res.end()
		return true
	}

	if (req.method !== 'GET') {
		res.writeHead(405, corsHeaders())
		res.end('Method Not Allowed')
		return true
	}

	serveTile(res, type, z, x, y).catch((err) => {
		console.error('[TileProxy] Unhandled error:', err)
		if (!res.headersSent) {
			res.writeHead(500, corsHeaders())
			res.end('Internal Server Error')
		}
	})

	return true
}
