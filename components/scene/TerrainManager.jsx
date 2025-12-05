import { useState, useRef, useMemo, useEffect, memo, useCallback } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'
import { RepeatWrapping, PlaneGeometry, Vector3, TextureLoader, ShaderMaterial, BufferAttribute } from 'three'
import { Noise } from 'noisejs'
import { useXR } from '@react-three/xr'

import useGameStore from '../../store/gameStore'
import GrassManager from './GrassManager'
import DistantTerrain from './DistantTerrain'
import { getRoadInfo } from '../../utils/roadMath'

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
