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

// Terrain tile dimensions
const VISUAL_TILE_SIZE = 256 // World units per visual tile
const PHYSICS_TILE_SIZE = 64 // World units per physics tile
const VISUAL_TILE_RESOLUTION = Math.floor(VISUAL_TILE_SIZE / 2) // Vertices per tile edge
const PHYSICS_TILE_RESOLUTION = Math.floor(PHYSICS_TILE_SIZE / 2)

// View/loading distances
const VISUAL_RENDER_DISTANCE = 300 // How far tiles are rendered visually
const PHYSICS_RENDER_DISTANCE = 30 // How far tiles have physics colliders

// Terrain generation parameters
const NOISE_SCALE = 15 // Higher = smoother terrain
const MAX_TERRAIN_HEIGHT = 4 // Maximum elevation in world units
const NORMAL_GRADIENT_EPSILON = 0.01 // For numerical normal calculation
const TILE_FADE_DURATION = 0.5 // Fade-in duration in seconds

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

// Physics-only tile
const TerrainCollider = memo(({ position, tileSize, resolution, smoothness, maxHeight, noise, flatAreaRadius, transitionEndDist }) => {
	const colliderArgs = useMemo(() => {
		const values = []
		const step = tileSize / resolution
		const halfTile = tileSize / 2

		for (let i = 0; i <= resolution; i++) {
			for (let j = 0; j <= resolution; j++) {
				const worldX = position[0] + i * step - halfTile
				const worldZ = position[2] + j * step - halfTile
				const roadInfo = getRoadInfo(worldX, worldZ)
				const baseHeight = getBaseHeight(worldX, worldZ, noise, smoothness, flatAreaRadius, transitionEndDist)

				const height =
					roadInfo.blendFactor > 0 ? (baseHeight * maxHeight * (1 - roadInfo.blendFactor) + roadInfo.roadHeight * roadInfo.blendFactor) / maxHeight : baseHeight
				values.push(height)
			}
		}
		return [resolution, resolution, values, { x: tileSize, y: maxHeight, z: tileSize }]
	}, [position, tileSize, resolution, smoothness, noise, maxHeight, flatAreaRadius, transitionEndDist])

	return (
		<RigidBody type='fixed' colliders={false} position={position}>
			<HeightfieldCollider args={colliderArgs} />
		</RigidBody>
	)
})

// Individual terrain tile with optional physics collider and road blending
const TerrainTile = memo(({ position, tileSize, resolution, smoothness, maxHeight, noise, map, normalMap, shouldFade = true, flatAreaRadius, transitionEndDist }) => {
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
		const doubleEpsilon = 2 * NORMAL_GRADIENT_EPSILON

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
				const hL = getBaseHeight(worldX - NORMAL_GRADIENT_EPSILON, worldZ, noise, smoothness, flatAreaRadius, transitionEndDist) * maxHeight
				const hR = getBaseHeight(worldX + NORMAL_GRADIENT_EPSILON, worldZ, noise, smoothness, flatAreaRadius, transitionEndDist) * maxHeight
				const hD = getBaseHeight(worldX, worldZ - NORMAL_GRADIENT_EPSILON, noise, smoothness, flatAreaRadius, transitionEndDist) * maxHeight
				const hU = getBaseHeight(worldX, worldZ + NORMAL_GRADIENT_EPSILON, noise, smoothness, flatAreaRadius, transitionEndDist) * maxHeight

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

	return (
		<group position={position}>
			<mesh geometry={geometry} material={material} receiveShadow />
		</group>
	)
})

// Manages dynamic tile loading/unloading based on camera position
const TerrainManager = () => {
	const [activeTiles, setActiveTiles] = useState([])
	const [activePhysicsTiles, setActivePhysicsTiles] = useState([])
	const lastTileCoord = useRef({ x: null, z: null })
	const lastPhysicsTileCoord = useRef({ x: null, z: null })
	const tileCache = useRef(new Map()) // Stable references prevent unnecessary re-renders
	const physicsTileCache = useRef(new Map())

	// Disable grass in XR, on mobile, or when performance is degraded
	const isInXR = useXR((state) => state.mode !== null)
	const isMobile = useGameStore((state) => state.isMobile)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const showGrass = !isInXR && !performanceDegraded && !isMobile

	const tilesInViewDistance = Math.ceil(VISUAL_RENDER_DISTANCE / VISUAL_TILE_SIZE) + 1
	const tilesInPhysicsDistance = Math.ceil(PHYSICS_RENDER_DISTANCE / PHYSICS_TILE_SIZE) + 1
	const noise = useMemo(() => new Noise(1234), []) // Seeded for deterministic terrain

	const [sandTexture, sandNormalMap] = useLoader(TextureLoader, ['/assets/images/ground/sand.jpg', '/assets/images/ground/sand_normal.jpg'])

	const distantTexture = useMemo(() => sandTexture.clone(), [sandTexture])

	const flatAreaRadius = VISUAL_TILE_SIZE * 0.5
	const transitionEndDist = VISUAL_TILE_SIZE * 2
	const normalScratch = useMemo(() => new Vector3(), []) // Reused to avoid allocations

	// Get raw height (0-1) at world position, without road blending
	const getRawHeight = useCallback(
		(worldX, worldZ) => getBaseHeight(worldX, worldZ, noise, NOISE_SCALE, flatAreaRadius, transitionEndDist),
		[noise, flatAreaRadius, transitionEndDist]
	)

	// Get terrain height in world units, with road blending applied
	const getTerrainHeight = useCallback(
		(worldX, worldZ) => {
			const baseHeight = getRawHeight(worldX, worldZ) * MAX_TERRAIN_HEIGHT
			const roadInfo = getRoadInfo(worldX, worldZ)
			return roadInfo.blendFactor > 0 ? baseHeight * (1 - roadInfo.blendFactor) + roadInfo.roadHeight * roadInfo.blendFactor : baseHeight
		},
		[getRawHeight]
	)

	// Get terrain normal at world position (for grass blade orientation)
	const getTerrainNormal = useCallback(
		(worldX, worldZ, target = normalScratch) => {
			const hL = getRawHeight(worldX - NORMAL_GRADIENT_EPSILON, worldZ) * MAX_TERRAIN_HEIGHT
			const hR = getRawHeight(worldX + NORMAL_GRADIENT_EPSILON, worldZ) * MAX_TERRAIN_HEIGHT
			const hD = getRawHeight(worldX, worldZ - NORMAL_GRADIENT_EPSILON) * MAX_TERRAIN_HEIGHT
			const hU = getRawHeight(worldX, worldZ + NORMAL_GRADIENT_EPSILON) * MAX_TERRAIN_HEIGHT
			return target.set(-(hR - hL) / (2 * NORMAL_GRADIENT_EPSILON), 1, -(hU - hD) / (2 * NORMAL_GRADIENT_EPSILON)).normalize()
		},
		[getRawHeight, normalScratch]
	)

	// Track active keys to avoid unnecessary state updates
	const activeTileKeysRef = useRef(new Set())
	const activePhysicsTileKeysRef = useRef(new Set())

	// Update active tiles based on camera/vehicle position
	useFrame(() => {
		const centerPosition = useGameStore.getState().cameraTarget

		// --- Visual Tiles Update ---
		const currentTileX = Math.floor(centerPosition.x / VISUAL_TILE_SIZE)
		const currentTileZ = Math.floor(centerPosition.z / VISUAL_TILE_SIZE)

		const newActiveTileKeys = new Set()
		const isInitialLoad = tileCache.current.size === 0
		const halfTile = VISUAL_TILE_SIZE / 2

		// Check all potential tiles in view distance square
		for (let x = -tilesInViewDistance; x <= tilesInViewDistance; x++) {
			for (let z = -tilesInViewDistance; z <= tilesInViewDistance; z++) {
				const tileX = currentTileX + x
				const tileZ = currentTileZ + z
				const tileCenterX = tileX * VISUAL_TILE_SIZE
				const tileCenterZ = tileZ * VISUAL_TILE_SIZE
				const dx = Math.max(Math.abs(centerPosition.x - tileCenterX) - halfTile, 0)
				const dz = Math.max(Math.abs(centerPosition.z - tileCenterZ) - halfTile, 0)
				const dist = Math.sqrt(dx * dx + dz * dz)

				if (dist <= VISUAL_RENDER_DISTANCE) {
					const tileKey = `${tileX},${tileZ}`
					newActiveTileKeys.add(tileKey)
				}
			}
		}

		// Only update state if keys changed
		let visualChanged = false
		if (newActiveTileKeys.size !== activeTileKeysRef.current.size) visualChanged = true
		else {
			for (const key of newActiveTileKeys) {
				if (!activeTileKeysRef.current.has(key)) {
					visualChanged = true
					break
				}
			}
		}

		if (visualChanged) {
			activeTileKeysRef.current = newActiveTileKeys
			for (const tileKey of newActiveTileKeys) {
				if (!tileCache.current.has(tileKey)) {
					const [tileX, tileZ] = tileKey.split(',').map(Number)
					tileCache.current.set(tileKey, {
						key: tileKey,
						position: [tileX * VISUAL_TILE_SIZE, 0, tileZ * VISUAL_TILE_SIZE],
						shouldFade: !isInitialLoad,
					})
				}
			}
			for (const key of tileCache.current.keys()) {
				if (!newActiveTileKeys.has(key)) tileCache.current.delete(key)
			}
			setActiveTiles(Array.from(newActiveTileKeys).map((key) => tileCache.current.get(key)))
		}

		// --- Physics Tiles Update ---
		const currentPhysicsTileX = Math.floor(centerPosition.x / PHYSICS_TILE_SIZE)
		const currentPhysicsTileZ = Math.floor(centerPosition.z / PHYSICS_TILE_SIZE)

		const newActivePhysicsTileKeys = new Set()
		const halfPhysicsTile = PHYSICS_TILE_SIZE / 2

		for (let x = -tilesInPhysicsDistance; x <= tilesInPhysicsDistance; x++) {
			for (let z = -tilesInPhysicsDistance; z <= tilesInPhysicsDistance; z++) {
				const tileX = currentPhysicsTileX + x
				const tileZ = currentPhysicsTileZ + z
				const tileCenterX = tileX * PHYSICS_TILE_SIZE
				const tileCenterZ = tileZ * PHYSICS_TILE_SIZE
				const dx = Math.max(Math.abs(centerPosition.x - tileCenterX) - halfPhysicsTile, 0)
				const dz = Math.max(Math.abs(centerPosition.z - tileCenterZ) - halfPhysicsTile, 0)
				const dist = Math.sqrt(dx * dx + dz * dz)

				if (dist <= PHYSICS_RENDER_DISTANCE) {
					const tileKey = `${tileX},${tileZ}`
					newActivePhysicsTileKeys.add(tileKey)
				}
			}
		}

		// Only update state if keys changed
		let physicsChanged = false
		if (newActivePhysicsTileKeys.size !== activePhysicsTileKeysRef.current.size) physicsChanged = true
		else {
			for (const key of newActivePhysicsTileKeys) {
				if (!activePhysicsTileKeysRef.current.has(key)) {
					physicsChanged = true
					break
				}
			}
		}

		if (physicsChanged) {
			activePhysicsTileKeysRef.current = newActivePhysicsTileKeys
			for (const tileKey of newActivePhysicsTileKeys) {
				if (!physicsTileCache.current.has(tileKey)) {
					const [tileX, tileZ] = tileKey.split(',').map(Number)
					physicsTileCache.current.set(tileKey, {
						key: tileKey,
						position: [tileX * PHYSICS_TILE_SIZE, 0, tileZ * PHYSICS_TILE_SIZE],
					})
				}
			}
			for (const key of physicsTileCache.current.keys()) {
				if (!newActivePhysicsTileKeys.has(key)) physicsTileCache.current.delete(key)
			}
			setActivePhysicsTiles(Array.from(newActivePhysicsTileKeys).map((key) => physicsTileCache.current.get(key)))
		}
	})

	return (
		<group name='TerrainManager'>
			<DistantTerrain noise={noise} map={distantTexture} />
			{activeTiles.map(({ key, position, shouldFade }) => (
				<TerrainTile
					key={key}
					position={position}
					shouldFade={shouldFade}
					tileSize={VISUAL_TILE_SIZE}
					resolution={VISUAL_TILE_RESOLUTION}
					smoothness={NOISE_SCALE}
					maxHeight={MAX_TERRAIN_HEIGHT}
					noise={noise}
					map={sandTexture}
					normalMap={sandNormalMap}
					flatAreaRadius={flatAreaRadius}
					transitionEndDist={transitionEndDist}
				/>
			))}
			{activePhysicsTiles.map(({ key, position }) => (
				<TerrainCollider
					key={key}
					position={position}
					tileSize={PHYSICS_TILE_SIZE}
					resolution={PHYSICS_TILE_RESOLUTION}
					smoothness={NOISE_SCALE}
					maxHeight={MAX_TERRAIN_HEIGHT}
					noise={noise}
					flatAreaRadius={flatAreaRadius}
					transitionEndDist={transitionEndDist}
				/>
			))}
			{showGrass && <GrassManager activeTiles={activeTiles} tileSize={VISUAL_TILE_SIZE} getTerrainHeight={getTerrainHeight} getTerrainNormal={getTerrainNormal} />}
		</group>
	)
}

export default TerrainManager
