import { Vector3, CatmullRomCurve3, DoubleSide, Color, BufferGeometry, BufferAttribute, MeshStandardMaterial } from 'three'

// Blade configuration (tuned for realistic scale)
const BLADE_CONFIG = {
	height: 0.22,
	baseWidth: 0.005,
	tipWidth: 0.002,
	segments: 3, // Low segment count for performance
	curvature: 0.35,
	twist: 0.15,
}

// Generate procedural grass blade geometry (for a single patch)
const createGrassPatchGeometry = (config, patchSize = 0.5, bladeCount = 50) => {
	const { height, baseWidth, tipWidth, segments, curvature, twist } = config

	// Create single blade geometry
	const points = []
	for (let i = 0; i <= segments; i++) {
		const t = i / segments
		const y = t * height
		const x = curvature * t * t * height
		const z = Math.sin(t * Math.PI) * curvature * 0.2 * height
		points.push(new Vector3(x, y, z))
	}

	const curve = new CatmullRomCurve3(points)
	const curvePoints = curve.getPoints(segments * 4)

	const numPoints = curvePoints.length

	// Pre-allocate arrays for entire patch (all blades)
	const verticesPerBlade = numPoints * 2
	const indicesPerBlade = (numPoints - 1) * 6

	const vertices = new Float32Array(verticesPerBlade * 3 * bladeCount)
	const normals = new Float32Array(verticesPerBlade * 3 * bladeCount)
	const uvs = new Float32Array(verticesPerBlade * 2 * bladeCount)
	const indices = new Uint16Array(indicesPerBlade * bladeCount)

	const up = new Vector3(0, 1, 0)
	const tempVec = new Vector3()
	const tangent = new Vector3()
	const normal = new Vector3()
	const binormal = new Vector3()

	// Generate each blade in the patch
	for (let b = 0; b < bladeCount; b++) {
		// Random position within circular patch
		const angle = Math.random() * Math.PI * 2
		const r = Math.sqrt(Math.random()) * patchSize
		const offsetX = Math.cos(angle) * r
		const offsetZ = Math.sin(angle) * r
		const rotationY = Math.random() * Math.PI * 2
		const scale = 0.8 + Math.random() * 0.4

		const cos = Math.cos(rotationY)
		const sin = Math.sin(rotationY)

		let vertIdx = b * verticesPerBlade * 3
		let uvIdx = b * verticesPerBlade * 2

		for (let i = 0; i < numPoints; i++) {
			const t = i / (numPoints - 1)
			const point = curvePoints[i]

			if (i < numPoints - 1) {
				tangent.subVectors(curvePoints[i + 1], point).normalize()
			}

			const widthFactor = 1 - t
			const currentWidth = (tipWidth + (baseWidth - tipWidth) * widthFactor) * scale

			binormal.crossVectors(up, tangent).normalize()

			const twistAngle = t * twist * Math.PI
			const twistCos = Math.cos(twistAngle)
			const twistSin = Math.sin(twistAngle)

			tempVec.copy(binormal)
			binormal.x = tempVec.x * twistCos - tangent.x * twistSin
			binormal.z = tempVec.z * twistCos - tangent.z * twistSin

			normal.crossVectors(tangent, binormal).normalize()

			const halfWidth = currentWidth * 0.5

			// Rotate and position the blade
			const localX = point.x * scale
			const localY = point.y * scale
			const localZ = point.z * scale

			// Left vertex
			const leftX = localX - binormal.x * halfWidth
			const leftY = localY - binormal.y * halfWidth
			const leftZ = localZ - binormal.z * halfWidth

			vertices[vertIdx] = leftX * cos - leftZ * sin + offsetX
			vertices[vertIdx + 1] = leftY
			vertices[vertIdx + 2] = leftX * sin + leftZ * cos + offsetZ

			// Right vertex
			const rightX = localX + binormal.x * halfWidth
			const rightY = localY + binormal.y * halfWidth
			const rightZ = localZ + binormal.z * halfWidth

			vertices[vertIdx + 3] = rightX * cos - rightZ * sin + offsetX
			vertices[vertIdx + 4] = rightY
			vertices[vertIdx + 5] = rightX * sin + rightZ * cos + offsetZ

			normals[vertIdx] = normal.x
			normals[vertIdx + 1] = normal.y
			normals[vertIdx + 2] = normal.z
			normals[vertIdx + 3] = normal.x
			normals[vertIdx + 4] = normal.y
			normals[vertIdx + 5] = normal.z

			vertIdx += 6

			uvs[uvIdx] = 0
			uvs[uvIdx + 1] = t
			uvs[uvIdx + 2] = 1
			uvs[uvIdx + 3] = t
			uvIdx += 4
		}

		// Indices for this blade
		const indexOffset = b * indicesPerBlade
		const vertexOffset = b * verticesPerBlade
		for (let i = 0, idxOffset = indexOffset; i < numPoints - 1; i++) {
			const baseIndex = vertexOffset + i * 2
			indices[idxOffset++] = baseIndex
			indices[idxOffset++] = baseIndex + 1
			indices[idxOffset++] = baseIndex + 2
			indices[idxOffset++] = baseIndex + 1
			indices[idxOffset++] = baseIndex + 3
			indices[idxOffset++] = baseIndex + 2
		}
	}

	const geom = new BufferGeometry()
	geom.setAttribute('position', new BufferAttribute(vertices, 3))
	geom.setAttribute('normal', new BufferAttribute(normals, 3))
	geom.setAttribute('uv', new BufferAttribute(uvs, 2))
	geom.setIndex(new BufferAttribute(indices, 1))

	return geom
}

/**
 * Factory function that creates a grass patch mesh for use in the vegetation system.
 * Returns geometry and material that can be instanced across the terrain.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.colorHex - Hex color for grass blades (default: '#c1ad79' for desert)
 * @returns {{ geometry: BufferGeometry, material: MeshStandardMaterial }}
 */
export const createGrassMesh = (options = {}) => {
	const { colorHex = '#c1ad79' } = options
	const geometry = createGrassPatchGeometry(BLADE_CONFIG)

	const material = new MeshStandardMaterial({
		color: new Color(colorHex),
		side: DoubleSide,
		roughness: 1.0,
		metalness: 0.0,
	})

	return { geometry, material }
}
