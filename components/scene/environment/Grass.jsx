import { useRef, useMemo, memo, useEffect, useReducer } from 'react'
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
	ShaderMaterial,
	Matrix4 
} from 'three'

import useGameStore, { vehicleState } from '../../../store/gameStore'
import grassVertexShader from '../../../shaders/grass.vert.glsl'
import grassFragmentShader from '../../../shaders/grass.frag.glsl'

// Seeded random number generator (mulberry32) - inlined for performance
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

// Pre-allocated scratch objects for matrix generation (avoids allocations in hot loop)
const _scratchDummy = new Object3D()
const _scratchUp = new Vector3(0, 1, 0)
const _scratchQuaternion = new Quaternion()
const _scratchMatrix = new Matrix4()

// Blade configuration (tuned for realistic scale)
const BLADE_CONFIG = {
	height: 0.22,
	baseWidth: 0.005,
	tipWidth: 0.002,
	segments: 3, // Low segment count for performance
	curvature: 0.35,
	twist: 0.15,
	colorBase: '#c9b896',
	colorTip: '#ddd5b8',
	ambientStrength: 0.6,
	translucency: 0.1,
	windStrength: 0.055,
	windFrequency: 1.5,
}

// Grass configuration for chunk-based generation
const GRASS_CHUNK_SIZE = 16
const GRASS_VIEW_DISTANCE = 60
const GRASS_LOD_DISTANCE = 35 // Distance at which to reduce blade count

const GRASS_CONFIG = {
	patchesPerChunk: { min: 4, max: 7 },
	patchRadius: { min: 0.3, max: 0.6 },
	bladesPerPatch: { min: 50, max: 150 },
	slopeThreshold: 0.85,
	flatAreaRadius: 12,
	heightOffset: -0.02,
	scaleRange: { min: 0.7, max: 1.3 },
	scaleVariation: 0.3,
	rotationVariation: 0.5,
}

// Maximum blades per chunk (for pre-allocating InstancedMesh)
const MAX_BLADES_PER_CHUNK = 1200

// Pre-allocate a reusable Float32Array for matrix building (16 elements per matrix * max blades)
const _matrixBuffer = new Float32Array(MAX_BLADES_PER_CHUNK * 16)

// Generate procedural grass blade geometry (shared across all instances)
const createGrassBladeGeometry = (config) => {
	const { height, baseWidth, tipWidth, segments, curvature, twist } = config

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
	// Pre-allocate arrays with known sizes
	const vertices = new Float32Array(numPoints * 2 * 3)
	const normals = new Float32Array(numPoints * 2 * 3)
	const uvs = new Float32Array(numPoints * 2 * 2)
	const indices = new Uint16Array((numPoints - 1) * 6)

	const up = new Vector3(0, 1, 0)
	const tempVec = new Vector3()
	const tangent = new Vector3()
	const normal = new Vector3()
	const binormal = new Vector3()

	let vertIdx = 0
	let uvIdx = 0

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

		const halfWidth = currentWidth * 0.5

		// Left vertex
		vertices[vertIdx] = point.x - binormal.x * halfWidth
		vertices[vertIdx + 1] = point.y - binormal.y * halfWidth
		vertices[vertIdx + 2] = point.z - binormal.z * halfWidth
		// Right vertex
		vertices[vertIdx + 3] = point.x + binormal.x * halfWidth
		vertices[vertIdx + 4] = point.y + binormal.y * halfWidth
		vertices[vertIdx + 5] = point.z + binormal.z * halfWidth

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

	for (let i = 0, idxOffset = 0; i < numPoints - 1; i++) {
		const baseIndex = i * 2
		indices[idxOffset++] = baseIndex
		indices[idxOffset++] = baseIndex + 1
		indices[idxOffset++] = baseIndex + 2
		indices[idxOffset++] = baseIndex + 1
		indices[idxOffset++] = baseIndex + 3
		indices[idxOffset++] = baseIndex + 2
	}

	const geom = new BufferGeometry()
	geom.setAttribute('position', new BufferAttribute(vertices, 3))
	geom.setAttribute('normal', new BufferAttribute(normals, 3))
	geom.setAttribute('uv', new BufferAttribute(uvs, 2))
	geom.setIndex(new BufferAttribute(indices, 1))

	return geom
}

// Reusable scratch vector for terrain normal calculations (avoids allocations)
const _normalScratch = new Vector3()

// Generate all blade instances for a chunk (returns Float32Array of matrices and count)
// lodFactor: 1.0 = full detail, 0.5 = half blades, etc.
const generateChunkBladeInstances = (chunkKey, chunkPosition, chunkSize, getTerrainHeight, getTerrainNormal, lodFactor = 1.0) => {
	const { patchesPerChunk, patchRadius, bladesPerPatch, slopeThreshold, flatAreaRadius, scaleRange, heightOffset, scaleVariation, rotationVariation } = GRASS_CONFIG

	const chunkX = Math.floor(chunkPosition[0] / chunkSize)
	const chunkZ = Math.floor(chunkPosition[2] / chunkSize)
	const chunkSeed = hashCoords(chunkX, chunkZ, 42069)
	const random = createSeededRandom(chunkSeed)

	// Use pre-allocated scratch objects
	const dummy = _scratchDummy
	const up = _scratchUp
	const quaternion = _scratchQuaternion
	
	let bladeCount = 0
	const flatAreaRadiusSq = flatAreaRadius * flatAreaRadius

	// Determine number of patches for this chunk
	const patchCount = Math.floor(random() * (patchesPerChunk.max - patchesPerChunk.min + 1)) + patchesPerChunk.min

	for (let patchIdx = 0; patchIdx < patchCount; patchIdx++) {
		// Random position within chunk
		const localX = (random() - 0.5) * chunkSize
		const localZ = (random() - 0.5) * chunkSize
		const patchWorldX = chunkPosition[0] + localX
		const patchWorldZ = chunkPosition[2] + localZ

		// Skip if in flat area near spawn (use squared distance to avoid sqrt)
		const distFromCenterSq = patchWorldX * patchWorldX + patchWorldZ * patchWorldZ
		if (distFromCenterSq < flatAreaRadiusSq) continue

		// Get terrain data at patch center
		const patchTerrainNormal = getTerrainNormal(patchWorldX, patchWorldZ)

		// Skip if slope is too steep
		if (patchTerrainNormal.y < slopeThreshold) continue

		// Random Y rotation for the patch
		const patchRotationY = random() * Math.PI * 2

		// Vary patch properties based on seed
		const radius = patchRadius.min + random() * (patchRadius.max - patchRadius.min)
		const baseBladeCount = Math.floor(bladesPerPatch.min + random() * (bladesPerPatch.max - bladesPerPatch.min))
		const patchScale = scaleRange.min + random() * (scaleRange.max - scaleRange.min)

		// Reduce blade count on steeper slopes
		const slopeFactor = (patchTerrainNormal.y - slopeThreshold) / (1 - slopeThreshold)
		// Apply LOD factor to reduce blades at distance
		const adjustedBladeCount = Math.floor(baseBladeCount * (0.5 + 0.5 * slopeFactor) * lodFactor)

		// Use a sub-seed for blade distribution within the patch
		const bladeSeed = hashCoords(chunkX * 1000 + patchIdx, chunkZ, 12345)
		const bladeRandom = createSeededRandom(bladeSeed)

		for (let bladeIdx = 0; bladeIdx < adjustedBladeCount; bladeIdx++) {
			// Random position within a circular area
			const angle = bladeRandom() * Math.PI * 2
			const r = Math.sqrt(bladeRandom()) * radius
			const bladeLocalX = Math.cos(angle) * r
			const bladeLocalZ = Math.sin(angle) * r

			// Calculate world position for this blade
			const bladeWorldX = patchWorldX + bladeLocalX
			const bladeWorldZ = patchWorldZ + bladeLocalZ

			// Sample terrain height at blade's world position
			const bladeTerrainY = getTerrainHeight(bladeWorldX, bladeWorldZ)
			
			// OPTIMIZATION: Use patch normal instead of sampling per-blade normal
			// This saves ~4 noise calls per blade (huge performance win)
			// Since patches are small (radius < 0.6), the normal variance is minimal
			const bladeTerrainNormal = patchTerrainNormal

			// Determine base rotation
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

			// Copy matrix elements directly into pre-allocated buffer
			const offset = bladeCount * 16
			const elements = dummy.matrix.elements
			for (let i = 0; i < 16; i++) {
				_matrixBuffer[offset + i] = elements[i]
			}
			bladeCount++
			
			// Safety check to prevent buffer overflow
			if (bladeCount >= MAX_BLADES_PER_CHUNK) break
		}
		if (bladeCount >= MAX_BLADES_PER_CHUNK) break
	}

	// Return a copy of only the used portion of the buffer
	return {
		array: new Float32Array(_matrixBuffer.buffer, 0, bladeCount * 16),
		count: bladeCount
	}
}

// GrassChunk component - single InstancedMesh for all blades in a chunk
const GrassChunk = memo(({ chunkKey, chunkPosition, chunkSize, lodFactor, getTerrainHeight, getTerrainNormal, sharedGeometry, sharedMaterial }) => {
	const meshRef = useRef()

	// Generate all blade matrices for this chunk
	const bladeData = useMemo(() => {
		return generateChunkBladeInstances(chunkKey, chunkPosition, chunkSize, getTerrainHeight, getTerrainNormal, lodFactor)
	}, [chunkKey, chunkPosition, chunkSize, getTerrainHeight, getTerrainNormal, lodFactor])

	// Create a single InstancedMesh for the entire chunk
	const instancedMesh = useMemo(() => {
		if (bladeData.count === 0) return null

		const mesh = new InstancedMesh(sharedGeometry, sharedMaterial, bladeData.count)
		
		// Copy matrix data directly from Float32Array
		mesh.instanceMatrix.array.set(bladeData.array)
		mesh.instanceMatrix.needsUpdate = true
		mesh.frustumCulled = true
		mesh.castShadow = false
		mesh.receiveShadow = false
		
		return mesh
	}, [bladeData, sharedGeometry, sharedMaterial])

	// Dispose InstancedMesh when chunk unmounts
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

// Main Grass component - shares geometry and material across all chunks
const Grass = memo(({ getTerrainHeight, getTerrainNormal }) => {
	const chunkCache = useRef(new Map())
	const frameCount = useRef(0)
	// Use useReducer for batch updates instead of useState (more efficient for arrays)
	const [activeChunks, updateChunks] = useReducer((_, chunks) => chunks, [])

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

	// Animate wind on the shared material
	useFrame((state) => {
		sharedMaterial.uniforms.uTime.value = state.clock.elapsedTime

		// Throttle chunk updates to every 10 frames
		frameCount.current++
		if (frameCount.current % 10 !== 0) return

		// Update active chunks based on vehicle position
		const targetPos = vehicleState.position
		const currentChunkX = Math.floor(targetPos.x / GRASS_CHUNK_SIZE)
		const currentChunkZ = Math.floor(targetPos.z / GRASS_CHUNK_SIZE)

		const chunksInView = Math.ceil(GRASS_VIEW_DISTANCE / GRASS_CHUNK_SIZE)
		const newActiveChunkKeys = new Set()
		const viewDistSq = GRASS_VIEW_DISTANCE * GRASS_VIEW_DISTANCE
		const lodDistSq = GRASS_LOD_DISTANCE * GRASS_LOD_DISTANCE
		
		let hasChanges = false

		for (let x = -chunksInView; x <= chunksInView; x++) {
			for (let z = -chunksInView; z <= chunksInView; z++) {
				const chunkX = currentChunkX + x
				const chunkZ = currentChunkZ + z
				const chunkKey = `${chunkX},${chunkZ}`

				const chunkCenterX = chunkX * GRASS_CHUNK_SIZE + GRASS_CHUNK_SIZE / 2
				const chunkCenterZ = chunkZ * GRASS_CHUNK_SIZE + GRASS_CHUNK_SIZE / 2

				const dx = targetPos.x - chunkCenterX
				const dz = targetPos.z - chunkCenterZ
				const distSq = dx * dx + dz * dz

				if (distSq <= viewDistSq) {
					newActiveChunkKeys.add(chunkKey)

					// Calculate LOD factor based on distance
					const lodFactor = distSq <= lodDistSq ? 1.0 : 0.5

					let chunkData = chunkCache.current.get(chunkKey)
					if (!chunkData) {
						chunkData = {
							key: chunkKey,
							position: [chunkX * GRASS_CHUNK_SIZE, 0, chunkZ * GRASS_CHUNK_SIZE],
							lodFactor,
						}
						chunkCache.current.set(chunkKey, chunkData)
						hasChanges = true
					} else if (chunkData.lodFactor !== lodFactor) {
						// Update LOD if changed
						chunkData = { ...chunkData, lodFactor }
						chunkCache.current.set(chunkKey, chunkData)
						hasChanges = true
					}
				}
			}
		}

		// Cleanup cache and check for removals
		for (const key of chunkCache.current.keys()) {
			if (!newActiveChunkKeys.has(key)) {
				chunkCache.current.delete(key)
				hasChanges = true
			}
		}

		if (hasChanges) {
			updateChunks(Array.from(newActiveChunkKeys).map((key) => chunkCache.current.get(key)))
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
		<group name="Grass">
			{activeChunks && activeChunks.map(({ key, position, lodFactor }) => (
				<GrassChunk
					key={key}
					chunkKey={key}
					chunkPosition={position}
					chunkSize={GRASS_CHUNK_SIZE}
					lodFactor={lodFactor}
					getTerrainHeight={getTerrainHeight}
					getTerrainNormal={getTerrainNormal}
					sharedGeometry={sharedGeometry}
					sharedMaterial={sharedMaterial}
				/>
			))}
		</group>
	)
})

export default Grass
