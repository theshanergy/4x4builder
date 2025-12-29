import { useMemo } from 'react'
import { Vector3 } from 'three'

/**
 * useTerrainCollider - Generates both physics collider args and mesh geometry data
 * from a single set of sane terrain inputs.
 *
 * BACKGROUND:
 * - A terrain mesh with NxN cells (segments) has (N+1)x(N+1) vertices
 * - Rapier's HeightfieldCollider uses "nrows/ncols" to mean cell count,
 *   but internally expects (nrows+1) * (ncols+1) height samples
 * - PlaneGeometry works the same way but uses different array indexing
 *
 * This hook completely encapsulates these quirks. You provide:
 * - segments: number of cells per axis (e.g., 16 means 16x16 grid of cells)
 * - size: world-space dimensions
 * - a height function that returns normalized heights
 *
 * You get back ready-to-use collider args and geometry buffers.
 *
 * @param {Object} options - Terrain configuration
 * @param {number} options.segments - Number of terrain cells per axis (NOT vertices)
 * @param {number} options.size - World-space size of the terrain patch
 * @param {number} options.maxHeight - Maximum terrain height for scaling normalized values
 * @param {Function} options.getHeight - Function(localX, localZ) => normalized height (0-1, can be negative)
 *                                       localX/localZ are in range [0, size], starting from corner
 * @param {Function} [options.getNormal] - Optional Function(localX, localZ, target: Vector3) => Vector3
 *                                         If not provided, normals are computed via finite differences
 * @param {Function} [options.getUV] - Optional Function(localX, localZ) => [u, v]
 *                                     If not provided, UVs are normalized local coords [0-1]
 *
 * @returns {Object} Complete terrain data
 * @returns {Array} return.colliderArgs - Args array for HeightfieldCollider
 * @returns {Float32Array} return.positions - Vertex positions for geometry
 * @returns {Float32Array} return.normals - Vertex normals for geometry
 * @returns {Float32Array} return.uvs - UV coordinates
 * @returns {number} return.segments - Echo back segments for PlaneGeometry creation
 * @returns {number} return.size - Echo back size for PlaneGeometry creation
 */
const useTerrainCollider = ({ segments, size, maxHeight, getHeight, getNormal, getUV }) => {
	return useMemo(() => {
		const sampleCount = segments + 1
		const totalSamples = sampleCount * sampleCount
		const step = size / segments

		// Height samples for the collider (row-major order for Rapier)
		const heightSamples = new Array(totalSamples)

		// Geometry buffers
		const positions = new Float32Array(totalSamples * 3)
		const normals = new Float32Array(totalSamples * 3)
		const uvs = new Float32Array(totalSamples * 2)

		// Scratch vector for normals
		const normalVec = new Vector3()
		const EPSILON = 0.01

		// Generate all data in a single pass
		for (let i = 0; i < sampleCount; i++) {
			for (let j = 0; j < sampleCount; j++) {
				// Local coordinates within the terrain patch
				const localX = i * step
				const localZ = j * step

				// Get normalized height
				const normalizedHeight = getHeight(localX, localZ)

				// Store height sample in row-major order for Rapier collider
				const sampleIndex = i * sampleCount + j
				heightSamples[sampleIndex] = normalizedHeight

				// Geometry uses column-major indexing (PlaneGeometry convention)
				const vertIndex = i + sampleCount * j
				const posIndex = vertIndex * 3
				const uvIndex = vertIndex * 2

				// Position: centered around origin, height scaled
				positions[posIndex] = localX - size / 2
				positions[posIndex + 1] = normalizedHeight * maxHeight
				positions[posIndex + 2] = localZ - size / 2

				// Compute normal
				if (getNormal) {
					getNormal(localX, localZ, normalVec)
				} else {
					// Finite difference approximation
					const hL = getHeight(Math.max(0, localX - EPSILON), localZ)
					const hR = getHeight(Math.min(size, localX + EPSILON), localZ)
					const hD = getHeight(localX, Math.max(0, localZ - EPSILON))
					const hU = getHeight(localX, Math.min(size, localZ + EPSILON))

					const dhdx = ((hR - hL) * maxHeight) / (2 * EPSILON)
					const dhdz = ((hU - hD) * maxHeight) / (2 * EPSILON)

					normalVec.set(-dhdx, 1, -dhdz).normalize()
				}

				normals[posIndex] = normalVec.x
				normals[posIndex + 1] = normalVec.y
				normals[posIndex + 2] = normalVec.z

				// UVs
				if (getUV) {
					const [u, v] = getUV(localX, localZ)
					uvs[uvIndex] = u
					uvs[uvIndex + 1] = v
				} else {
					// Default: normalized local coords [0-1]
					uvs[uvIndex] = i / segments
					uvs[uvIndex + 1] = j / segments
				}
			}
		}

		// Build collider args in the format HeightfieldCollider expects
		const colliderArgs = [
			segments, // nrows (cell count, NOT sample count)
			segments, // ncols (cell count, NOT sample count)
			heightSamples, // (segments+1)² samples in row-major order
			{ x: size, y: maxHeight, z: size },
		]

		return {
			colliderArgs,
			positions,
			normals,
			uvs,
			segments,
			size,
		}
	}, [segments, size, maxHeight, getHeight, getNormal, getUV])
}

export default useTerrainCollider
