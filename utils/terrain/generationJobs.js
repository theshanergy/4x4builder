// Shared job executor for terrain/vegetation generation. Runs identically
// inside a Web Worker (terrainWorker.js) or on the main thread (worker pool
// fallback). All results are plain objects of transferable typed arrays.
//
// Each executor lazily creates its own terrainHelpers — terrain generation is
// fully deterministic from config, so independent instances (one per worker)
// produce bit-identical output.

import { createTerrainHelpers } from './heightSampler'
import { buildTileArrays } from './tileGeometryBuilder'
import { buildVegetationChunkArrays } from '../vegetation/vegetationChunks'
import VEGETATION_CONFIG from '../../config/vegetation'

export const createJobExecutor = () => {
	let helpers = null
	const getHelpers = () => (helpers ??= createTerrainHelpers())

	/**
	 * @param {'tile'|'veg'} kind
	 * @param {Object} payload - tile: { node: {size, centerX, centerZ}, edgeStitchInfo }
	 *                           veg:  { typeIndex, chunkX, chunkZ, chunkSize }
	 * @returns {{ result: Object, transferables: ArrayBuffer[] }}
	 */
	const execute = (kind, payload) => {
		if (kind === 'tile') {
			const arrays = buildTileArrays(payload.node, getHelpers(), payload.edgeStitchInfo)
			const transferables = [arrays.positions.buffer, arrays.normals.buffer, arrays.uvs.buffer, arrays.heightCache.buffer]
			if (arrays.roadWeights) transferables.push(arrays.roadWeights.buffer, arrays.roadParams.buffer)
			if (arrays.climateAttr) transferables.push(arrays.climateAttr.buffer)
			if (arrays.water) {
				transferables.push(arrays.water.positions.buffer, arrays.water.depths.buffer)
				if (arrays.water.indices) transferables.push(arrays.water.indices.buffer)
			}
			return { result: arrays, transferables }
		}

		if (kind === 'veg') {
			const config = VEGETATION_CONFIG[payload.typeIndex]
			const result = buildVegetationChunkArrays(payload.chunkX, payload.chunkZ, payload.chunkSize, config, payload.typeIndex, getHelpers())
			const transferables = [result.matrices.buffer]
			if (result.colliders) transferables.push(result.colliders.buffer)
			return { result, transferables }
		}

		throw new Error(`Unknown terrain job kind: ${kind}`)
	}

	return { execute }
}
