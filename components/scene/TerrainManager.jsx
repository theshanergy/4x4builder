import { useState, useRef, useMemo, useEffect, memo, useCallback } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'
import { RepeatWrapping, PlaneGeometry, Vector3, TextureLoader, ShaderMaterial, BufferAttribute } from 'three'
import { Noise } from 'noisejs'
import { useXR } from '@react-three/xr'

import useGameStore from '../../store/gameStore'
import GrassManager from './GrassManager'
import DistantTerrain from './DistantTerrain'

import terrainVertexShader from '../../shaders/terrain.vert.glsl?raw'
import terrainFragmentShader from '../../shaders/terrain.frag.glsl?raw'

// Epsilon for numerical gradient approximation (normal calculation)
const GRADIENT_EPSILON = 0.01
const TILE_FADE_DURATION = 0.5 // seconds

const TERRAIN_CONFIG = {
	viewDistance: 160, // How far tiles are rendered from camera
	tileSize: 32, // World units per tile
	resolution: 16, // Vertices per tile edge (affects collision detail)
	smoothness: 15, // Noise scale - higher = smoother terrain
	maxHeight: 4, // Maximum terrain elevation in world units
}

// Create a shared noise instance for terrain sampling (same seed as TerrainManager)
const terrainNoiseSampler = new Noise(1234)

// Reusable Vector3 instances to avoid allocations in hot paths
const _roadPos = new Vector3()
const _tangent = new Vector3()

// Cache for getRoadInfo results (key: "x,z" rounded to precision)
const roadInfoCache = new Map()
const ROAD_INFO_CACHE_PRECISION = 0.5 // Cache precision in world units
const ROAD_INFO_CACHE_MAX_SIZE = 5000

// Road curve parameters - controls the procedural generation
const CURVE_AMP_X = 60 // Lateral curve amplitude
const CURVE_FREQ_X = 0.002 // Lateral curve frequency
const CURVE_OFFSET_X = 0.0005 // Secondary lateral variation

// Terrain sampling parameters for road height
const ROAD_HEIGHT_SAMPLES = 50 // Number of samples to average for smooth road
const ROAD_HEIGHT_SAMPLE_DISTANCE = 120 // Distance ahead/behind to sample
const ROAD_HEIGHT_DAMPING = 0.2 // Reduce terrain height influence on road (0-1)

// Spawn area parameters - road starts straight and flat at origin
const SPAWN_FLAT_RADIUS = 50 // Road is straight and flat within this distance from origin
const SPAWN_TRANSITION_END = 150 // Road fully follows curves/terrain beyond this distance

// Road dimensions - matching reference road profile
export const ROAD_WIDTH = 14 // Total road width (7m half-width)
export const ROAD_SHOULDER_WIDTH = 3 // Shoulder extends 3m beyond road edge
export const ROAD_TRANSITION_WIDTH = 22 // Transition from shoulder to full terrain

// Cache for road heights to avoid recalculating
const roadHeightCache = new Map()
const CACHE_PRECISION = 1 // Round Z to this precision for caching

/**
 * Sample raw terrain height at a position (without road influence)
 */
const sampleTerrainHeight = (x, z) => {
	const noiseValue = terrainNoiseSampler.perlin2(x / TERRAIN_CONFIG.smoothness, z / TERRAIN_CONFIG.smoothness)
	const normalizedHeight = (noiseValue + 1) / 2
	return normalizedHeight * TERRAIN_CONFIG.maxHeight
}

/**
 * Calculate road X position at given Z (lateral position only)
 * The curve naturally passes through x=0 at z=0 and gradually increases amplitude
 */
const getRoadXAtZ = (z) => {
	// Base curve using sine (naturally 0 at z=0)
	const baseCurve = Math.sin(z * CURVE_FREQ_X) * CURVE_AMP_X

	// Secondary variation (also using sine to be 0 at origin)
	const secondaryCurve = Math.sin(z * CURVE_OFFSET_X * 2.3) * (CURVE_AMP_X * 0.3)

	// Gradual amplitude envelope - starts at 0 and ramps up over distance
	const distFromOrigin = Math.abs(z)
	let amplitude
	if (distFromOrigin < SPAWN_FLAT_RADIUS) {
		amplitude = 0
	} else if (distFromOrigin < SPAWN_TRANSITION_END) {
		const t = (distFromOrigin - SPAWN_FLAT_RADIUS) / (SPAWN_TRANSITION_END - SPAWN_FLAT_RADIUS)
		// Use smootherstep for very gradual curve introduction
		amplitude = t * t * t * (t * (t * 6 - 15) + 10)
	} else {
		amplitude = 1
	}

	return (baseCurve + secondaryCurve) * amplitude
}

/**
 * Calculate smoothed road height by averaging terrain samples along the path
 */
const calculateSmoothedRoadHeight = (z) => {
	const cacheKey = Math.round(z / CACHE_PRECISION) * CACHE_PRECISION

	if (roadHeightCache.has(cacheKey)) {
		return roadHeightCache.get(cacheKey)
	}

	let totalHeight = 0
	let totalWeight = 0

	// Sample terrain at multiple points ahead and behind for smoothing
	for (let i = -ROAD_HEIGHT_SAMPLES; i <= ROAD_HEIGHT_SAMPLES; i++) {
		const sampleZ = z + (i / ROAD_HEIGHT_SAMPLES) * ROAD_HEIGHT_SAMPLE_DISTANCE
		const sampleX = getRoadXAtZ(sampleZ)

		// Gaussian-like weight - stronger falloff for distant samples
		const normalizedDist = i / ROAD_HEIGHT_SAMPLES
		const weight = Math.exp(-2 * normalizedDist * normalizedDist)

		totalHeight += sampleTerrainHeight(sampleX, sampleZ) * weight
		totalWeight += weight
	}

	// Apply damping to reduce height variation
	const avgTerrainHeight = totalHeight / totalWeight
	const smoothedHeight = avgTerrainHeight * ROAD_HEIGHT_DAMPING

	// Cache the result
	roadHeightCache.set(cacheKey, smoothedHeight)

	// Limit cache size
	if (roadHeightCache.size > 2000) {
		const firstKey = roadHeightCache.keys().next().value
		roadHeightCache.delete(firstKey)
	}

	return smoothedHeight
}

/**
 * Calculates the center position of the road at a given Z coordinate.
 * Pass optional target Vector3 to avoid allocation.
 */
const getRoadPositionAtZ = (z, target = _roadPos) => {
	const distFromOrigin = Math.abs(z)

	// Lateral position (X)
	const x = getRoadXAtZ(z)

	// Elevation (Y) - follows averaged terrain height for smooth driving
	let y
	if (distFromOrigin < SPAWN_FLAT_RADIUS) {
		y = 0
	} else if (distFromOrigin < SPAWN_TRANSITION_END) {
		const t = (distFromOrigin - SPAWN_FLAT_RADIUS) / (SPAWN_TRANSITION_END - SPAWN_FLAT_RADIUS)
		const blend = t * t * t * (t * (t * 6 - 15) + 10)
		const terrainHeight = calculateSmoothedRoadHeight(z)
		y = terrainHeight * blend
	} else {
		y = calculateSmoothedRoadHeight(z)
	}

	return target.set(x, y, z)
}

/**
 * Calculates the tangent (direction) at Z.
 * Pass optional target Vector3 to avoid allocation.
 */
const getRoadTangentAtZ = (z, target = _tangent) => {
	const delta = 1.0
	const p1 = getRoadPositionAtZ(z - delta, new Vector3())
	const p2 = getRoadPositionAtZ(z + delta, new Vector3())
	return target.set(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z).normalize()
}

/**
 * Check if a world position is on or near the road
 * @param {number} worldX - World X coordinate
 * @param {number} worldZ - World Z coordinate
 * @returns {object} { isOnRoad, isInTransition, blendFactor, roadHeight }
 */
export const getRoadInfo = (worldX, worldZ) => {
	// Check cache first
	const cacheKeyX = Math.round(worldX / ROAD_INFO_CACHE_PRECISION) * ROAD_INFO_CACHE_PRECISION
	const cacheKeyZ = Math.round(worldZ / ROAD_INFO_CACHE_PRECISION) * ROAD_INFO_CACHE_PRECISION
	const cacheKey = `${cacheKeyX},${cacheKeyZ}`

	const cached = roadInfoCache.get(cacheKey)
	if (cached !== undefined) {
		return cached
	}

	// Use thread-local vectors to avoid allocation
	const roadPos = getRoadPositionAtZ(worldZ, _roadPos)
	const tangent = getRoadTangentAtZ(worldZ, _tangent)

	// Calculate bank angle based on road curvature
	const bankAngle = roadPos.x * 0.0015

	// Calculate Right vector (perpendicular to tangent and up)
	const worldUp = { x: 0, y: 1, z: 0 }
	// right = cross(worldUp, tangent)
	let rightX = worldUp.y * tangent.z - worldUp.z * tangent.y
	let rightY = worldUp.z * tangent.x - worldUp.x * tangent.z
	let rightZ = worldUp.x * tangent.y - worldUp.y * tangent.x
	const rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ)
	if (rightLen > 0.001) {
		rightX /= rightLen
		rightY /= rightLen
		rightZ /= rightLen
	}

	// Apply banking rotation to right vector (rotate around tangent by bankAngle)
	const cosBank = Math.cos(bankAngle)
	const sinBank = Math.sin(bankAngle)
	// Rodrigues' rotation formula simplified for rotation around tangent
	const dot = rightX * tangent.x + rightY * tangent.y + rightZ * tangent.z
	const crossX = tangent.y * rightZ - tangent.z * rightY
	const crossY = tangent.z * rightX - tangent.x * rightZ
	const crossZ = tangent.x * rightY - tangent.y * rightX
	const bankedRightX = rightX * cosBank + crossX * sinBank + tangent.x * dot * (1 - cosBank)
	const bankedRightY = rightY * cosBank + crossY * sinBank + tangent.y * dot * (1 - cosBank)
	const bankedRightZ = rightZ * cosBank + crossZ * sinBank + tangent.z * dot * (1 - cosBank)

	// Calculate signed distance along the banked right vector
	// Project the offset from road center onto the right vector
	const offsetX = worldX - roadPos.x
	const offsetZ = worldZ - roadPos.z // This is 0 since we sample at same Z
	const signedDistance = offsetX * bankedRightX + offsetZ * bankedRightZ
	const distance = Math.abs(signedDistance)

	// Calculate height offset due to banking
	const bankOffset = signedDistance * bankedRightY

	const roadHalfWidth = ROAD_WIDTH / 2
	const shoulderEnd = roadHalfWidth + ROAD_SHOULDER_WIDTH
	const transitionEnd = roadHalfWidth + ROAD_TRANSITION_WIDTH

	let blendFactor = 0 // 0 = full terrain, 1 = full road
	let isOnRoad = false
	let isInTransition = false

	if (distance < roadHalfWidth) {
		// On the road - full road height
		isOnRoad = true
		blendFactor = 1
	} else if (distance < shoulderEnd) {
		// On shoulder - keep road height (banked plane)
		isInTransition = true
		blendFactor = 1.0 // Shoulder follows road plane exactly
	} else if (distance < transitionEnd) {
		// In transition zone - smootherstep from shoulder to terrain
		isInTransition = true
		const t = (distance - shoulderEnd) / (transitionEnd - shoulderEnd)
		// Use smootherstep for very smooth transition
		const smoothT = t * t * t * (t * (t * 6 - 15) + 10)
		blendFactor = 1.0 - smoothT
	}

	const result = {
		isOnRoad,
		isInTransition,
		blendFactor,
		roadHeight: roadPos.y + bankOffset,
		roadX: roadPos.x,
		signedDistance,
		bankAngle,
	}

	// Cache the result
	roadInfoCache.set(cacheKey, result)

	// Limit cache size
	if (roadInfoCache.size > ROAD_INFO_CACHE_MAX_SIZE) {
		const firstKey = roadInfoCache.keys().next().value
		roadInfoCache.delete(firstKey)
	}

	return result
}

// Shared height calculation for both tile generation and terrain queries
const getBaseHeight = (worldX, worldZ, noise, smoothness, flatAreaRadius, transitionEndDist) => {
	const distSq = worldX * worldX + worldZ * worldZ
	const flatAreaRadiusSq = flatAreaRadius * flatAreaRadius

	if (distSq < flatAreaRadiusSq) return 0

	const normalizedHeight = (noise.perlin2(worldX / smoothness, worldZ / smoothness) + 1) / 2
	const transitionEndDistSq = transitionEndDist * transitionEndDist

	if (distSq < transitionEndDistSq) {
		const t = (Math.sqrt(distSq) - flatAreaRadius) / (transitionEndDist - flatAreaRadius)
		return normalizedHeight * (t * t * (3 - 2 * t))
	}
	return normalizedHeight
}

// Individual terrain tile with physics collider and road blending
const TerrainTile = memo(({ position, tileSize, resolution, smoothness, maxHeight, noise, map, normalMap, shouldFade = true }) => {
	const materialRef = useRef()
	const opacityRef = useRef(shouldFade ? 0 : 1)

	// Animate opacity for smooth tile fade-in
	useFrame((_, delta) => {
		if (materialRef.current && opacityRef.current < 1) {
			opacityRef.current = Math.min(1, opacityRef.current + delta / TILE_FADE_DURATION)
			materialRef.current.uniforms.opacity.value = opacityRef.current
			materialRef.current.transparent = opacityRef.current < 1
		}
	})

	// Configure texture wrapping - UVs use world coordinates for seamless tiling
	useMemo(() => {
		if (map) {
			map.wrapS = map.wrapT = RepeatWrapping
			map.repeat.set(1, 1) // 1 texture per world unit
		}
		if (normalMap) {
			normalMap.wrapS = normalMap.wrapT = RepeatWrapping
			normalMap.repeat.set(0.33, 0.33) // Larger scale for normal details
		}
	}, [map, normalMap])

	// Flat area around spawn point, then smooth transition to full terrain
	const flatAreaRadius = tileSize * 0.5
	const transitionEndDist = tileSize * 2

	// Generate all vertex data: positions, normals, UVs, and road blend attributes
	const terrainData = useMemo(() => {
		const values = [] // Heights for physics collider (normalized 0-1)
		const vertexCount = (resolution + 1) * (resolution + 1)
		const positions = new Float32Array(vertexCount * 3)
		const uvs = new Float32Array(vertexCount * 2)
		const normals = new Float32Array(vertexCount * 3)
		const roadBlendArr = new Float32Array(vertexCount)
		const signedRoadDistArr = new Float32Array(vertexCount)
		const step = tileSize / resolution
		const halfTile = tileSize / 2
		const invResolution = 1 / resolution
		const doubleEpsilon = 2 * GRADIENT_EPSILON

		for (let i = 0; i <= resolution; i++) {
			for (let j = 0; j <= resolution; j++) {
				const worldX = position[0] + i * step - halfTile
				const worldZ = position[2] + j * step - halfTile
				const roadInfo = getRoadInfo(worldX, worldZ) // Get road proximity data
				const baseHeight = getBaseHeight(worldX, worldZ, noise, smoothness, flatAreaRadius, transitionEndDist)

				// Blend terrain height with road height based on proximity
				const height =
					roadInfo.blendFactor > 0 ? (baseHeight * maxHeight * (1 - roadInfo.blendFactor) + roadInfo.roadHeight * roadInfo.blendFactor) / maxHeight : baseHeight
				values.push(height)

				const vertIndex = i + (resolution + 1) * j
				const posIndex = vertIndex * 3
				positions[posIndex] = i * invResolution * tileSize - halfTile
				positions[posIndex + 1] = height * maxHeight
				positions[posIndex + 2] = j * invResolution * tileSize - halfTile

				roadBlendArr[vertIndex] = roadInfo.blendFactor
				signedRoadDistArr[vertIndex] = roadInfo.signedDistance

				// Compute normal via numerical gradient (sample 4 neighboring heights)
				// Uses base terrain only - road surface is flat
				const hL = getBaseHeight(worldX - GRADIENT_EPSILON, worldZ, noise, smoothness, flatAreaRadius, transitionEndDist) * maxHeight
				const hR = getBaseHeight(worldX + GRADIENT_EPSILON, worldZ, noise, smoothness, flatAreaRadius, transitionEndDist) * maxHeight
				const hD = getBaseHeight(worldX, worldZ - GRADIENT_EPSILON, noise, smoothness, flatAreaRadius, transitionEndDist) * maxHeight
				const hU = getBaseHeight(worldX, worldZ + GRADIENT_EPSILON, noise, smoothness, flatAreaRadius, transitionEndDist) * maxHeight

				// Normal from gradient: n = normalize(-dh/dx, 1, -dh/dz)
				const dhdx = (hR - hL) / doubleEpsilon
				const dhdz = (hU - hD) / doubleEpsilon
				const nx = -dhdx,
					ny = 1,
					nz = -dhdz
				const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz)

				normals[posIndex] = nx * invLen
				normals[posIndex + 1] = ny * invLen
				normals[posIndex + 2] = nz * invLen

				// World-space UVs for seamless texture tiling across tiles
				const uvIndex = vertIndex * 2
				uvs[uvIndex] = worldX
				uvs[uvIndex + 1] = worldZ
			}
		}

		return { values, positions, uvs, normals, roadBlend: roadBlendArr, signedRoadDist: signedRoadDistArr }
	}, [position, tileSize, resolution, smoothness, noise, maxHeight, flatAreaRadius, transitionEndDist])

	// Create geometry with custom road blend attributes for shader
	const geometry = useMemo(() => {
		const geom = new PlaneGeometry(tileSize, tileSize, resolution, resolution)
		geom.getAttribute('position').array.set(terrainData.positions)
		geom.getAttribute('uv').array.set(terrainData.uvs)
		geom.getAttribute('uv').needsUpdate = true
		geom.getAttribute('normal').array.set(terrainData.normals)
		geom.getAttribute('normal').needsUpdate = true
		geom.setAttribute('roadBlend', new BufferAttribute(terrainData.roadBlend, 1))
		geom.setAttribute('signedRoadDist', new BufferAttribute(terrainData.signedRoadDist, 1))
		return geom
	}, [terrainData, tileSize, resolution])

	// Shader material for terrain/road blending
	const material = useMemo(
		() =>
			new ShaderMaterial({
				vertexShader: terrainVertexShader,
				fragmentShader: terrainFragmentShader,
				uniforms: {
					sandMap: { value: map },
					sandNormalMap: { value: normalMap },
					opacity: { value: opacityRef.current },
				},
				transparent: opacityRef.current < 1,
			}),
		[map, normalMap]
	)

	useEffect(() => {
		materialRef.current = material
	}, [material])

	// Cleanup geometry and material on unmount
	useEffect(
		() => () => {
			geometry.dispose()
			material.dispose()
		},
		[geometry, material]
	)

	// Heightfield collider args: [rows, cols, heights, scale]
	const colliderArgs = useMemo(() => [resolution, resolution, terrainData.values, { x: tileSize, y: maxHeight, z: tileSize }], [resolution, terrainData, tileSize, maxHeight])

	return (
		<RigidBody type='fixed' position={position} colliders={false}>
			<HeightfieldCollider args={colliderArgs} name={`Tile-${position[0]}-${position[2]}`} />
			<mesh geometry={geometry} material={material} receiveShadow />
		</RigidBody>
	)
})

// Manages dynamic tile loading/unloading based on camera position
const TerrainManager = () => {
	const { viewDistance, tileSize, resolution, smoothness, maxHeight } = TERRAIN_CONFIG
	const [activeTiles, setActiveTiles] = useState([])
	const lastTileCoord = useRef({ x: null, z: null })
	const tileCache = useRef(new Map()) // Stable references prevent unnecessary re-renders

	// Disable grass in XR, on mobile, or when performance is degraded
	const isInXR = useXR((state) => state.mode !== null)
	const isMobile = useGameStore((state) => state.isMobile)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const showGrass = !isInXR && !performanceDegraded && !isMobile

	const tilesInViewDistance = useMemo(() => Math.ceil(viewDistance / tileSize), [viewDistance, tileSize])
	const noise = useMemo(() => new Noise(1234), []) // Seeded for deterministic terrain

	const [sandTexture, sandNormalMap] = useLoader(TextureLoader, ['/assets/images/ground/sand.jpg', '/assets/images/ground/sand_normal.jpg'])

	const distantTexture = useMemo(() => sandTexture.clone(), [sandTexture])

	const flatAreaRadius = tileSize * 0.5
	const transitionEndDist = tileSize * 2
	const normalScratch = useMemo(() => new Vector3(), []) // Reused to avoid allocations

	// Get raw height (0-1) at world position, without road blending
	const getRawHeight = useCallback(
		(worldX, worldZ) => getBaseHeight(worldX, worldZ, noise, smoothness, flatAreaRadius, transitionEndDist),
		[noise, smoothness, flatAreaRadius, transitionEndDist]
	)

	// Get terrain height in world units, with road blending applied
	const getTerrainHeight = useCallback(
		(worldX, worldZ) => {
			const baseHeight = getRawHeight(worldX, worldZ) * maxHeight
			const roadInfo = getRoadInfo(worldX, worldZ)
			return roadInfo.blendFactor > 0 ? baseHeight * (1 - roadInfo.blendFactor) + roadInfo.roadHeight * roadInfo.blendFactor : baseHeight
		},
		[getRawHeight, maxHeight]
	)

	// Get terrain normal at world position (for grass blade orientation)
	const getTerrainNormal = useCallback(
		(worldX, worldZ, target = normalScratch) => {
			const hL = getRawHeight(worldX - GRADIENT_EPSILON, worldZ) * maxHeight
			const hR = getRawHeight(worldX + GRADIENT_EPSILON, worldZ) * maxHeight
			const hD = getRawHeight(worldX, worldZ - GRADIENT_EPSILON) * maxHeight
			const hU = getRawHeight(worldX, worldZ + GRADIENT_EPSILON) * maxHeight
			return target.set(-(hR - hL) / (2 * GRADIENT_EPSILON), 1, -(hU - hD) / (2 * GRADIENT_EPSILON)).normalize()
		},
		[getRawHeight, maxHeight, normalScratch]
	)

	// Update active tiles based on camera target position
	useFrame(() => {
		const centerPosition = useGameStore.getState().cameraTarget
		const currentTileX = Math.floor(centerPosition.x / tileSize)
		const currentTileZ = Math.floor(centerPosition.z / tileSize)

		// Only update tiles if the center position moved to a new tile
		if (currentTileX === lastTileCoord.current.x && currentTileZ === lastTileCoord.current.z) {
			return
		}
		lastTileCoord.current.x = currentTileX
		lastTileCoord.current.z = currentTileZ

		const newActiveTileKeys = new Set()
		const isInitialLoad = tileCache.current.size === 0
		const halfTile = tileSize / 2

		// Check all potential tiles in view distance square
		for (let x = -tilesInViewDistance; x <= tilesInViewDistance; x++) {
			for (let z = -tilesInViewDistance; z <= tilesInViewDistance; z++) {
				const tileX = currentTileX + x
				const tileZ = currentTileZ + z
				const dx = centerPosition.x - (tileX * tileSize + halfTile)
				const dz = centerPosition.z - (tileZ * tileSize + halfTile)

				// Circular distance check for smoother tile loading
				if (Math.sqrt(dx * dx + dz * dz) <= viewDistance) {
					const tileKey = `${tileX},${tileZ}`
					newActiveTileKeys.add(tileKey)
					if (!tileCache.current.has(tileKey)) {
						tileCache.current.set(tileKey, {
							key: tileKey,
							position: [tileX * tileSize, 0, tileZ * tileSize],
							shouldFade: !isInitialLoad,
						})
					}
				}
			}
		}

		// Remove tiles no longer in view
		for (const key of tileCache.current.keys()) {
			if (!newActiveTileKeys.has(key)) tileCache.current.delete(key)
		}

		setActiveTiles(Array.from(newActiveTileKeys).map((key) => tileCache.current.get(key)))
	})

	return (
		<group name='TerrainManager'>
			<DistantTerrain noise={noise} map={distantTexture} />
			{activeTiles.map(({ key, position, shouldFade }) => (
				<TerrainTile
					key={key}
					position={position}
					shouldFade={shouldFade}
					tileSize={tileSize}
					resolution={resolution}
					smoothness={smoothness}
					maxHeight={maxHeight}
					noise={noise}
					map={sandTexture}
					normalMap={sandNormalMap}
				/>
			))}
			{showGrass && <GrassManager activeTiles={activeTiles} tileSize={tileSize} getTerrainHeight={getTerrainHeight} getTerrainNormal={getTerrainNormal} />}
		</group>
	)
}

export default TerrainManager
