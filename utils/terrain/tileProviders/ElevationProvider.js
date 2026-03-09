/**
 * Elevation tile provider using the AWS Terrarium format.
 *
 * Source: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
 * All requests are routed through the server-side tile proxy which caches to disk.
 *
 * Terrarium encoding (per pixel):
 *   elevation (metres) = R×256 + G + B/256 − 32768
 *   Range: −32768 m … +32767 m
 *
 * Tiles are 256×256 pixels. Decoded as Float32Array[65536] in row-major
 * top-to-bottom, left-to-right order — index = row*256 + col.
 */

import { TileProvider } from './TileProvider.js'
import { latLngToTile, getElevationZoom } from '../geoProjection.js'

export const ELEVATION_TILE_SIZE = 256

export class ElevationProvider extends TileProvider {
	/**
	 * @param {object} options
	 * @param {string} options.serverBase   - Tile server base URL (from GEO_CONFIG)
	 * @param {number} [options.memoryCap]  - In-memory LRU cap (default 300)
	 * @param {number} options.verticalScale - Game units per elevation metre
	 * @param {number[]} options.lodZoomLevels - From GEO_CONFIG.lodZoomLevels
	 */
	constructor({ serverBase, memoryCap = 300, verticalScale = 1.0, lodZoomLevels }) {
		super({ type: 'elevation', serverBase, memoryCap })
		this.verticalScale = verticalScale
		this.lodZoomLevels = lodZoomLevels
	}

	/**
	 * Decode a Terrarium PNG ArrayBuffer into a Float32Array of elevations.
	 * Uses OffscreenCanvas to read pixel data without touching the DOM.
	 *
	 * @param {ArrayBuffer} arrayBuffer
	 * @returns {Promise<Float32Array>}
	 */
	async decode(arrayBuffer) {
		const blob = new Blob([arrayBuffer], { type: 'image/png' })
		const bitmap = await createImageBitmap(blob)
		const canvas = new OffscreenCanvas(ELEVATION_TILE_SIZE, ELEVATION_TILE_SIZE)
		const ctx = canvas.getContext('2d')
		ctx.drawImage(bitmap, 0, 0)
		bitmap.close()

		const { data } = ctx.getImageData(0, 0, ELEVATION_TILE_SIZE, ELEVATION_TILE_SIZE)
		const elevations = new Float32Array(ELEVATION_TILE_SIZE * ELEVATION_TILE_SIZE)
		for (let i = 0; i < elevations.length; i++) {
			const r = data[i * 4]
			const g = data[i * 4 + 1]
			const b = data[i * 4 + 2]
			elevations[i] = (r * 256 + g + b / 256 - 32768) * this.verticalScale
		}
		return elevations
	}

	// ---------------------------------------------------------------------------
	// Elevation sampling
	// ---------------------------------------------------------------------------

	/**
	 * Sample elevation at a fractional pixel position within a tile using
	 * bilinear interpolation.
	 *
	 * @param {Float32Array} tileData - Decoded 256×256 elevation tile
	 * @param {number} fracX - Fractional column position in [0, 1)
	 * @param {number} fracY - Fractional row position in [0, 1)
	 * @returns {number} Elevation in game units
	 */
	sampleBilinear(tileData, fracX, fracY) {
		const sz = ELEVATION_TILE_SIZE
		const px = fracX * (sz - 1)
		const py = fracY * (sz - 1)
		const x0 = Math.floor(px)
		const y0 = Math.floor(py)
		const x1 = Math.min(x0 + 1, sz - 1)
		const y1 = Math.min(y0 + 1, sz - 1)
		const tx = px - x0
		const ty = py - y0

		return (
			tileData[y0 * sz + x0] * (1 - tx) * (1 - ty) +
			tileData[y0 * sz + x1] * tx * (1 - ty) +
			tileData[y1 * sz + x0] * (1 - tx) * ty +
			tileData[y1 * sz + x1] * tx * ty
		)
	}

	/**
	 * Get elevation at a geographic coordinate.
	 * Returns null if the tile is not loaded — use fetchTile() to load it first.
	 *
	 * Tries the ideal zoom first, then falls back to progressively coarser zooms
	 * so that something is always returned once any tile is loaded.
	 *
	 * @param {number} lat
	 * @param {number} lng
	 * @param {number} preferredZoom - Ideal zoom level for the current game LOD
	 * @returns {number|null}
	 */
	getElevation(lat, lng, preferredZoom) {
		for (let zoom = preferredZoom; zoom >= 6; zoom--) {
			const { x, y, fracX, fracY } = latLngToTile(lat, lng, zoom)
			const tile = this.getTile(zoom, x, y)
			if (tile) return this.sampleBilinear(tile, fracX, fracY)
		}
		return null
	}

	/**
	 * Get the zoom level appropriate for a game LOD level.
	 */
	zoomForLod(lodLevel) {
		return getElevationZoom(lodLevel, this.lodZoomLevels)
	}
}
