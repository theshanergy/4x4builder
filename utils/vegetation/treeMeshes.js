// Procedural low-poly vegetation meshes (pines, leafy trees, shrubs, cacti).
// Each factory returns vertex-colored merged geometry suitable for instanced
// rendering, with multiple LOD variants where it pays off. Flat shading +
// vertex colors keeps everything on one cheap material per type.

import { Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial, Float32BufferAttribute } from 'three'
import { mergeBufferGeometries } from 'three-stdlib'

// Paint a uniform vertex color (with slight per-vertex luminance jitter for a
// hand-painted feel) onto a geometry. Deterministic — jitter comes from a
// hash of the vertex index, not Math.random().
const paintGeometry = (geometry, hex, jitter = 0.06) => {
	const color = new Color(hex)
	const count = geometry.attributes.position.count
	const colors = new Float32Array(count * 3)
	for (let i = 0; i < count; i++) {
		const h = Math.sin(i * 12.9898) * 43758.5453
		const j = 1 + (h - Math.floor(h) - 0.5) * 2 * jitter
		colors[i * 3] = color.r * j
		colors[i * 3 + 1] = color.g * j
		colors[i * 3 + 2] = color.b * j
	}
	geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
	return geometry
}

const createVegetationMaterial = () =>
	new MeshStandardMaterial({
		vertexColors: true,
		flatShading: true,
		roughness: 1.0,
		metalness: 0.0,
	})

const mergeParts = (parts) => {
	// Cylinders/cones are indexed but icosahedrons are not — normalize to
	// non-indexed so they merge (and flat shading wants unshared verts anyway).
	const nonIndexed = parts.map((part) => (part.index ? part.toNonIndexed() : part))
	const merged = mergeBufferGeometries(nonIndexed, false)
	parts.forEach((part) => part.dispose())
	nonIndexed.forEach((part) => {
		if (part !== merged) part.dispose()
	})
	return merged
}

const COLORS = {
	trunk: '#6b4a2f',
	pine: '#2f5d34',
	pineDark: '#27502d',
	leaf: '#4a7a32',
	leafDark: '#3f6b2b',
	shrub: '#5d6e35',
	cactus: '#5a7d4a',
}

// ---------------------------------------------------------------------------
// Pine — trunk + stacked foliage cones. ~9 m tall at scale 1.
// ---------------------------------------------------------------------------
const buildPine = (detail) => {
	const radialSegments = detail ? 7 : 5
	const parts = []

	const trunk = new CylinderGeometry(0.14, 0.26, 2.6, detail ? 6 : 5, 1, true)
	trunk.translate(0, 1.3, 0)
	parts.push(paintGeometry(trunk, COLORS.trunk))

	if (detail) {
		const tiers = [
			{ r: 2.0, h: 3.2, y: 3.4 },
			{ r: 1.55, h: 2.8, y: 5.3 },
			{ r: 1.05, h: 2.4, y: 7.2 },
		]
		tiers.forEach((tier, i) => {
			const cone = new ConeGeometry(tier.r, tier.h, radialSegments, 1, true)
			cone.translate(0, tier.y, 0)
			parts.push(paintGeometry(cone, i % 2 ? COLORS.pineDark : COLORS.pine))
		})
	} else {
		const cone = new ConeGeometry(1.9, 6.6, radialSegments, 1, true)
		cone.translate(0, 5.2, 0)
		parts.push(paintGeometry(cone, COLORS.pine))
	}

	return mergeParts(parts)
}

export const createPineMesh = () => {
	const material = createVegetationMaterial()
	return {
		lods: {
			0: { geometry: buildPine(true), material },
			2: { geometry: buildPine(false), material },
		},
	}
}

// ---------------------------------------------------------------------------
// Leafy tree — trunk + clustered canopy blobs. ~6.5 m tall at scale 1.
// ---------------------------------------------------------------------------
const buildLeafyTree = (detail) => {
	const parts = []

	const trunk = new CylinderGeometry(0.16, 0.3, 2.8, detail ? 6 : 5, 1, true)
	trunk.translate(0, 1.4, 0)
	parts.push(paintGeometry(trunk, COLORS.trunk))

	if (detail) {
		const blobs = [
			{ r: 1.7, x: 0, y: 4.4, z: 0, color: COLORS.leaf },
			{ r: 1.25, x: 1.0, y: 3.7, z: 0.5, color: COLORS.leafDark },
			{ r: 1.15, x: -0.9, y: 3.9, z: -0.4, color: COLORS.leafDark },
		]
		blobs.forEach((blob) => {
			const sphere = new IcosahedronGeometry(blob.r, 1)
			sphere.scale(1, 0.85, 1)
			sphere.translate(blob.x, blob.y, blob.z)
			parts.push(paintGeometry(sphere, blob.color, 0.09))
		})
	} else {
		const sphere = new IcosahedronGeometry(1.9, 0)
		sphere.scale(1, 0.85, 1)
		sphere.translate(0, 4.2, 0)
		parts.push(paintGeometry(sphere, COLORS.leaf, 0.09))
	}

	return mergeParts(parts)
}

export const createLeafyTreeMesh = () => {
	const material = createVegetationMaterial()
	return {
		lods: {
			0: { geometry: buildLeafyTree(true), material },
			2: { geometry: buildLeafyTree(false), material },
		},
	}
}

// ---------------------------------------------------------------------------
// Shrub — squashed icosphere. ~0.9 m tall at scale 1.
// ---------------------------------------------------------------------------
export const createShrubMesh = () => {
	const geometry = new IcosahedronGeometry(0.8, 1)
	geometry.scale(1, 0.6, 1)
	geometry.translate(0, 0.4, 0)
	paintGeometry(geometry, COLORS.shrub, 0.1)
	return { geometry, material: createVegetationMaterial() }
}

// ---------------------------------------------------------------------------
// Cactus — saguaro-style trunk with two offset arms. ~2.4 m tall at scale 1.
// ---------------------------------------------------------------------------
export const createCactusMesh = () => {
	const parts = []

	const trunk = new CylinderGeometry(0.16, 0.2, 2.4, 6)
	trunk.translate(0, 1.2, 0)
	parts.push(paintGeometry(trunk, COLORS.cactus, 0.04))

	const armConfigs = [
		{ x: 0.42, y: 1.35, tilt: 0.5, h: 1.0 },
		{ x: -0.4, y: 1.0, tilt: -0.55, h: 0.8 },
	]
	armConfigs.forEach((arm) => {
		const geometry = new CylinderGeometry(0.1, 0.12, arm.h, 5)
		geometry.translate(0, arm.h / 2, 0)
		geometry.rotateZ(arm.tilt)
		geometry.translate(arm.x, arm.y, 0)
		parts.push(paintGeometry(geometry, COLORS.cactus, 0.04))
	})

	return { geometry: mergeParts(parts), material: createVegetationMaterial() }
}
