import { useRef, useMemo, memo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { 
	Vector3, 
	Quaternion, 
	CatmullRomCurve3, 
	DoubleSide, 
	Color, 
	BufferGeometry, 
	BufferAttribute, 
	Object3D, 
	InstancedMesh, 
	ShaderMaterial 
} from 'three'

import grassVertexShader from '../../shaders/grass.vert.glsl'
import grassFragmentShader from '../../shaders/grass.frag.glsl'

// Seeded random number generator (mulberry32)
const createSeededRandom = (seed) => {
	let state = seed
	return () => {
		state = (state + 0x6d2b79f5) | 0
		let t = Math.imul(state ^ (state >>> 15), state | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

// Hash function for generating consistent seeds from coordinates
const hashCoords = (x, z, salt = 0) => {
	const h = (x * 374761393 + z * 668265263 + salt * 1013904223) | 0
	return Math.abs(h)
}

// Blade configuration (tuned for realistic scale)
const BLADE_CONFIG = {
	height: 0.18, // Increased from 0.16 to compensate for ground sinking
	baseWidth: 0.005,
	tipWidth: 0.002,
	segments: 3, // Reduced from 8 for performance (65% fewer triangles)
	curvature: 0.35,
	twist: 0.15,
	colorBase: '#c9b896',
	colorTip: '#ddd5b8',
	ambientStrength: 0.6,
	translucency: 0.1,
	windStrength: 0.04,
	windFrequency: 1.5,
}

// Grass configuration for tile-based generation
const GRASS_CONFIG = {
	patchesPerTile: { min: 15, max: 25 },
	patchRadius: { min: 0.3, max: 0.6 },
	bladesPerPatch: { min: 50, max: 150 },
	slopeThreshold: 0.85,
	flatAreaRadius: 12,
	heightOffset: -0.02, // Sink blades slightly into ground to prevent floating on hilltops
	scaleRange: { min: 0.7, max: 1.3 },
	// Patch-level blade distribution settings
	scaleVariation: 0.3,
	rotationVariation: 0.5,
}

// Maximum blades per tile (for pre-allocating InstancedMesh)
// Max patches (25) * max blades per patch (150) = 3750
const MAX_BLADES_PER_TILE = 4000

// Generate procedural grass blade geometry (shared across all instances)
const createGrassBladeGeometry = (config) => {
	const { height, baseWidth, tipWidth, segments, curvature, twist } = config

	const points = []
	for (let i = 0; i <= segments; i++) {
		const t = i / segments
		const y = t * height
		const x = curvature * Math.pow(t, 2) * height
		const z = Math.sin(t * Math.PI) * curvature * 0.2 * height
		points.push(new Vector3(x, y, z))
	}

	const curve = new CatmullRomCurve3(points)
	const curvePoints = curve.getPoints(segments * 4)

	const vertices = []
	const normals = []
	const uvs = []
	const indices = []

	const up = new Vector3(0, 1, 0)
	const tempVec = new Vector3()
	const tangent = new Vector3()
	const normal = new Vector3()
	const binormal = new Vector3()

	const numPoints = curvePoints.length

	for (let i = 0; i < numPoints; i++) {
		const t = i / (numPoints - 1)
		const point = curvePoints[i]

		if (i < numPoints - 1) {
			tangent.subVectors(curvePoints[i + 1], point).normalize()
		}

		const widthFactor = 1 - t
		const currentWidth = tipWidth + (baseWidth - tipWidth) * widthFactor

		binormal.crossVectors(up, tangent).normalize()

		const twistAngle = t * twist * Math.PI
		const cos = Math.cos(twistAngle)
		const sin = Math.sin(twistAngle)

		tempVec.copy(binormal)
		binormal.x = tempVec.x * cos - tangent.x * sin
		binormal.z = tempVec.z * cos - tangent.z * sin

		normal.crossVectors(tangent, binormal).normalize()

		vertices.push(point.x - binormal.x * currentWidth * 0.5, point.y - binormal.y * currentWidth * 0.5, point.z - binormal.z * currentWidth * 0.5)
		vertices.push(point.x + binormal.x * currentWidth * 0.5, point.y + binormal.y * currentWidth * 0.5, point.z + binormal.z * currentWidth * 0.5)

		normals.push(normal.x, normal.y, normal.z)
		normals.push(normal.x, normal.y, normal.z)

		uvs.push(0, t)
		uvs.push(1, t)
	}

	for (let i = 0; i < numPoints - 1; i++) {
		const baseIndex = i * 2
		indices.push(baseIndex, baseIndex + 1, baseIndex + 2)
		indices.push(baseIndex + 1, baseIndex + 3, baseIndex + 2)
	}

	const geom = new BufferGeometry()
	geom.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
	geom.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
	geom.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
	geom.setIndex(new BufferAttribute(new Uint16Array(indices), 1))

	return geom
}

// Reusable scratch vector for terrain normal calculations (avoids allocations)
const _normalScratch = new Vector3()

// Generate all blade instances for a tile (returns Float32Array of matrices and count)
const generateTileBladeInstances = (tileKey, tilePosition, tileSize, getTerrainHeight, getTerrainNormal) => {
	const { patchesPerTile, patchRadius, bladesPerPatch, slopeThreshold, flatAreaRadius, scaleRange, heightOffset, scaleVariation, rotationVariation } = GRASS_CONFIG

	const tileX = Math.floor(tilePosition[0] / tileSize)
	const tileZ = Math.floor(tilePosition[2] / tileSize)
	const tileSeed = hashCoords(tileX, tileZ, 42069)
	const random = createSeededRandom(tileSeed)

	// Pre-allocate array for matrix elements (will be trimmed at end)
	const matrixElements = []
	const dummy = new Object3D()
	const up = new Vector3(0, 1, 0)
	const quaternion = new Quaternion()

	// Determine number of patches for this tile (same logic as before)
	const patchCount = Math.floor(random() * (patchesPerTile.max - patchesPerTile.min + 1)) + patchesPerTile.min

	for (let patchIdx = 0; patchIdx < patchCount; patchIdx++) {
		// Random position within tile (same as before)
		const localX = (random() - 0.5) * tileSize
		const localZ = (random() - 0.5) * tileSize
		const patchWorldX = tilePosition[0] + localX
		const patchWorldZ = tilePosition[2] + localZ

		// Skip if in flat area near spawn
		const distFromCenter = Math.sqrt(patchWorldX * patchWorldX + patchWorldZ * patchWorldZ)
		if (distFromCenter < flatAreaRadius) continue

		// Get terrain data at patch center
		const patchTerrainNormal = getTerrainNormal(patchWorldX, patchWorldZ)

		// Skip if slope is too steep
		if (patchTerrainNormal.y < slopeThreshold) continue

		// Random Y rotation for the patch (same as before)
		const patchRotationY = random() * Math.PI * 2

		// Vary patch properties based on seed (same as before)
		const radius = patchRadius.min + random() * (patchRadius.max - patchRadius.min)
		const bladeCount = Math.floor(bladesPerPatch.min + random() * (bladesPerPatch.max - bladesPerPatch.min))
		const patchScale = scaleRange.min + random() * (scaleRange.max - scaleRange.min)

		// Reduce blade count on steeper slopes (same as before)
		const slopeFactor = (patchTerrainNormal.y - slopeThreshold) / (1 - slopeThreshold)
		const adjustedBladeCount = Math.floor(bladeCount * (0.5 + 0.5 * slopeFactor))

		// Generate blades within this patch (same distribution as Grass.jsx)
		// Use a sub-seed for blade distribution within the patch
		const bladeSeed = hashCoords(tileX * 1000 + patchIdx, tileZ, 12345)
		const bladeRandom = createSeededRandom(bladeSeed)

		for (let bladeIdx = 0; bladeIdx < adjustedBladeCount; bladeIdx++) {
			// Random position within a circular area (same as Grass.jsx)
			const angle = bladeRandom() * Math.PI * 2
			const r = Math.sqrt(bladeRandom()) * radius
			const bladeLocalX = Math.cos(angle) * r
			const bladeLocalZ = Math.sin(angle) * r

			// Calculate world position for this blade
			const bladeWorldX = patchWorldX + bladeLocalX
			const bladeWorldZ = patchWorldZ + bladeLocalZ

			// Sample terrain height at blade's world position
			const bladeTerrainY = getTerrainHeight(bladeWorldX, bladeWorldZ)
			// Use scratch vector to avoid allocation
			const bladeTerrainNormal = getTerrainNormal(bladeWorldX, bladeWorldZ, _normalScratch)

			// Determine base rotation (inward curve strategy, same as before)
			const baseRotY = -angle + Math.PI
			const rotY = baseRotY + (bladeRandom() - 0.5) * rotationVariation

			// Random scale variation within the patch
			const bladeScale = patchScale * (1 - scaleVariation / 2 + bladeRandom() * scaleVariation)

			// Set blade position in world coordinates
			dummy.position.set(bladeWorldX, bladeTerrainY + heightOffset, bladeWorldZ)

			// Apply terrain normal alignment per-blade
			quaternion.setFromUnitVectors(up, bladeTerrainNormal)
			dummy.quaternion.copy(quaternion)
			dummy.rotateY(rotY + patchRotationY)

			dummy.scale.setScalar(bladeScale)
			dummy.updateMatrix()

			// Push matrix elements directly (avoid clone allocation)
			matrixElements.push(...dummy.matrix.elements)
		}
	}

	// Return as Float32Array for direct use with InstancedMesh
	return {
		array: new Float32Array(matrixElements),
		count: matrixElements.length / 16
	}
}

// GrassTile component - single InstancedMesh for all blades in a tile
const GrassTile = memo(({ tileKey, tilePosition, tileSize, getTerrainHeight, getTerrainNormal, sharedGeometry, sharedMaterial }) => {
	const meshRef = useRef()

	// Generate all blade matrices for this tile (returns {array: Float32Array, count: number})
	const bladeData = useMemo(() => {
		return generateTileBladeInstances(tileKey, tilePosition, tileSize, getTerrainHeight, getTerrainNormal)
	}, [tileKey, tilePosition, tileSize, getTerrainHeight, getTerrainNormal])

	// Create a single InstancedMesh for the entire tile
	const instancedMesh = useMemo(() => {
		if (bladeData.count === 0) return null

		const mesh = new InstancedMesh(sharedGeometry, sharedMaterial, bladeData.count)
		
		// Copy matrix data directly from Float32Array (no per-instance loop)
		mesh.instanceMatrix.array.set(bladeData.array)
		mesh.instanceMatrix.needsUpdate = true
		mesh.frustumCulled = true
		mesh.castShadow = false // Grass shouldn't cast shadows for performance
		
		return mesh
	}, [bladeData, sharedGeometry, sharedMaterial])

	// Dispose InstancedMesh when tile unmounts (geometry/material are shared, so don't dispose those)
	useEffect(() => {
		return () => {
			if (instancedMesh) {
				instancedMesh.dispose()
			}
		}
	}, [instancedMesh])

	if (!instancedMesh) return null

	return <primitive ref={meshRef} object={instancedMesh} />
})

// Main GrassManager component - shares geometry and material across all tiles
const GrassManager = memo(({ activeTiles, tileSize, getTerrainHeight, getTerrainNormal }) => {
	const materialRef = useRef()

	// Create shared geometry once
	const sharedGeometry = useMemo(() => {
		return createGrassBladeGeometry(BLADE_CONFIG)
	}, [])

	// Create shared material once
	const sharedMaterial = useMemo(() => {
		return new ShaderMaterial({
			vertexShader: grassVertexShader,
			fragmentShader: grassFragmentShader,
			defines: {
				USE_INSTANCING: '',
			},
			uniforms: {
				uTime: { value: 0 },
				uWindStrength: { value: BLADE_CONFIG.windStrength },
				uWindFrequency: { value: BLADE_CONFIG.windFrequency },
				uColorBase: { value: new Color(BLADE_CONFIG.colorBase) },
				uColorTip: { value: new Color(BLADE_CONFIG.colorTip) },
				uAmbientStrength: { value: BLADE_CONFIG.ambientStrength },
				uTranslucency: { value: BLADE_CONFIG.translucency },
			},
			side: DoubleSide,
		})
	}, [])

	// Store material ref for animation
	useEffect(() => {
		materialRef.current = sharedMaterial
	}, [sharedMaterial])

	// Animate wind on the shared material
	useFrame((state) => {
		if (materialRef.current) {
			materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
		}
	})

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			sharedGeometry.dispose()
			sharedMaterial.dispose()
		}
	}, [sharedGeometry, sharedMaterial])

	return (
		<group name="GrassManager">
			{activeTiles.map(({ key, position }) => (
				<GrassTile
					key={key}
					tileKey={key}
					tilePosition={position}
					tileSize={tileSize}
					getTerrainHeight={getTerrainHeight}
					getTerrainNormal={getTerrainNormal}
					sharedGeometry={sharedGeometry}
					sharedMaterial={sharedMaterial}
				/>
			))}
		</group>
	)
})

export default GrassManager
