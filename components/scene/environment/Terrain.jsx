import { useState, useRef, useMemo, useEffect, memo, useCallback } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'
import { RepeatWrapping, PlaneGeometry, Vector3, TextureLoader } from 'three'
import { Noise } from 'noisejs'
import { useXR } from '@react-three/xr'

import useGameStore, { vehicleState } from '../../../store/gameStore'
import Grass from './Grass'
import DistantTerrain from './DistantTerrain'

// Epsilon for numerical gradient approximation
const GRADIENT_EPSILON = 0.01

// Fade-in duration for new tiles (in seconds)
const TILE_FADE_DURATION = 0.5

// Regional height modulation scale (size of flat/hilly regions)
const REGION_SCALE = 240

// Default terrain configuration
const DEFAULT_TERRAIN_CONFIG = {
	viewDistance: 160,
	tileSize: 32,
	resolution: 16,
	smoothness: 15,
	maxHeight: 4,
}

// Shared terrain height calculation utilities
const createTerrainHelpers = (noise, smoothness, flatAreaRadius, transitionEndDist) => {
	const flatAreaRadiusSq = flatAreaRadius * flatAreaRadius
	const transitionEndDistSq = transitionEndDist * transitionEndDist

	// Get raw height value at any world position (normalized 0-1)
	const getRawHeight = (worldX, worldZ) => {
		const distSq = worldX * worldX + worldZ * worldZ
		if (distSq < flatAreaRadiusSq) return 0

		const noiseValue = noise.perlin2(worldX / smoothness, worldZ / smoothness)
		const normalizedHeight = (noiseValue + 1) / 2

		// Regional height modulation - creates dispersed flatter areas
		const regionNoise = noise.perlin2(worldX / REGION_SCALE + 100, worldZ / REGION_SCALE + 100)
		// Map to 0.1-1.0 range: some areas have 10% height (much flatter), others full height
		const regionModifier = 0.1 + (regionNoise + 1) * 0.45

		if (distSq < transitionEndDistSq) {
			const t = (Math.sqrt(distSq) - flatAreaRadius) / (transitionEndDist - flatAreaRadius)
			return normalizedHeight * (t * t * (3 - 2 * t)) * regionModifier
		}
		return normalizedHeight * regionModifier
	}

	// Get terrain height at any world position (in world units)
	const getHeight = (worldX, worldZ, maxHeight) => {
		return getRawHeight(worldX, worldZ) * maxHeight
	}

	// Get terrain normal at any world position
	const getNormal = (worldX, worldZ, maxHeight, target) => {
		const hL = getRawHeight(worldX - GRADIENT_EPSILON, worldZ) * maxHeight
		const hR = getRawHeight(worldX + GRADIENT_EPSILON, worldZ) * maxHeight
		const hD = getRawHeight(worldX, worldZ - GRADIENT_EPSILON) * maxHeight
		const hU = getRawHeight(worldX, worldZ + GRADIENT_EPSILON) * maxHeight

		const dhdx = (hR - hL) / (2 * GRADIENT_EPSILON)
		const dhdz = (hU - hD) / (2 * GRADIENT_EPSILON)

		return target.set(-dhdx, 1, -dhdz).normalize()
	}

	return { getRawHeight, getHeight, getNormal }
}

// TerrainTile component
const TerrainTile = memo(({ position, tileSize, resolution, maxHeight, terrainHelpers, map, normalMap, shouldFade = true }) => {
	const materialRef = useRef()
	const opacityRef = useRef(shouldFade ? 0 : 1)

	// Animate opacity from 0 to 1 when tile is created
	useFrame((_, delta) => {
		if (materialRef.current && opacityRef.current < 1) {
			opacityRef.current = Math.min(1, opacityRef.current + delta / TILE_FADE_DURATION)
			materialRef.current.opacity = opacityRef.current
			materialRef.current.transparent = opacityRef.current < 1
		}
	})

	// Apply texture settings - UVs are now in world coordinates, so repeat controls texture density
	useMemo(() => {
		if (map) {
			map.wrapS = map.wrapT = RepeatWrapping
			map.repeat.set(1, 1) // 1 texture unit per world unit
		}
		if (normalMap) {
			normalMap.wrapS = normalMap.wrapT = RepeatWrapping
			normalMap.repeat.set(0.33, 0.33) // Larger scale for normal map details
		}
	}, [map, normalMap])

	// Generate heights, UVs, and normals together to avoid redundant calculations
	const heights = useMemo(() => {
		const { getRawHeight, getNormal } = terrainHelpers
		const values = []
		const vertexCount = (resolution + 1) * (resolution + 1)
		const positions = new Float32Array(vertexCount * 3)
		const uvs = new Float32Array(vertexCount * 2)
		const normals = new Float32Array(vertexCount * 3)
		const step = tileSize / resolution

		const normal = new Vector3()

		for (let i = 0; i <= resolution; i++) {
			for (let j = 0; j <= resolution; j++) {
				const worldX = position[0] + i * step - tileSize / 2
				const worldZ = position[2] + j * step - tileSize / 2

				const height = getRawHeight(worldX, worldZ)
				values.push(height)

				const vertIndex = i + (resolution + 1) * j
				const posIndex = vertIndex * 3
				positions[posIndex] = (i / resolution) * tileSize - tileSize / 2
				positions[posIndex + 1] = height * maxHeight
				positions[posIndex + 2] = (j / resolution) * tileSize - tileSize / 2

				// Compute normal using shared helper
				getNormal(worldX, worldZ, maxHeight, normal)

				normals[posIndex] = normal.x
				normals[posIndex + 1] = normal.y
				normals[posIndex + 2] = normal.z

				// Store UVs based on world position (computed once, reused in geometry)
				const uvIndex = vertIndex * 2
				uvs[uvIndex] = worldX
				uvs[uvIndex + 1] = worldZ
			}
		}

		return { values, positions, uvs, normals }
	}, [position, tileSize, resolution, terrainHelpers, maxHeight])

	// Create geometry for terrain mesh
	const geometry = useMemo(() => {
		const geom = new PlaneGeometry(tileSize, tileSize, resolution, resolution)
		geom.getAttribute('position').array.set(heights.positions)

		// Apply pre-computed UVs (world-space coordinates for seamless tiling)
		geom.getAttribute('uv').array.set(heights.uvs)
		geom.getAttribute('uv').needsUpdate = true

		// Apply pre-computed normals (calculated analytically from noise gradient)
		geom.getAttribute('normal').array.set(heights.normals)
		geom.getAttribute('normal').needsUpdate = true

		return geom
	}, [heights, tileSize, resolution])

	// Dispose geometry when component unmounts or geometry changes
	useEffect(() => {
		return () => {
			geometry.dispose()
		}
	}, [geometry])

	// Set collider arguments
	const colliderArgs = useMemo(() => {
		return [resolution, resolution, heights.values, { x: tileSize, y: maxHeight, z: tileSize }]
	}, [resolution, heights, tileSize, maxHeight])

	return (
		<RigidBody type='fixed' position={position} colliders={false}>
			<HeightfieldCollider args={colliderArgs} name={`Tile-${position[0]}-${position[2]}`} />
			<mesh geometry={geometry} receiveShadow>
				<meshStandardMaterial ref={materialRef} map={map} normalMap={normalMap} transparent={opacityRef.current < 1} opacity={opacityRef.current} />
			</mesh>
		</RigidBody>
	)
})

// Main Terrain component
const Terrain = () => {
	const { viewDistance, tileSize, resolution, smoothness, maxHeight } = DEFAULT_TERRAIN_CONFIG
	const [activeTiles, setActiveTiles] = useState([])
	const lastTileCoord = useRef({ x: null, z: null })
	const tileCache = useRef(new Map()) // Cache tile data to maintain stable references

	// Check if grass should be disabled (XR mode, performance degraded, or mobile device)
	const isInXR = useXR((state) => state.mode !== null)
	const isMobile = useGameStore((state) => state.isMobile)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const showGrass = !isInXR && !performanceDegraded && !isMobile

	// Pre-compute view distance tile count
	const tilesInViewDistance = useMemo(() => Math.ceil(viewDistance / tileSize), [viewDistance, tileSize])

	// Generate noise instance
	const noise = useMemo(() => new Noise(1234), [])

	const [sandTexture, sandNormalMap] = useLoader(TextureLoader, ['/assets/images/ground/sand.jpg', '/assets/images/ground/sand_normal.jpg'])

	const distantTexture = useMemo(() => sandTexture.clone(), [sandTexture])

	// Flat area and transition parameters
	const flatAreaRadius = tileSize * 0.5
	const transitionEndDist = tileSize * 2

	// Create shared terrain helpers (memoized for stable reference)
	const terrainHelpers = useMemo(() => createTerrainHelpers(noise, smoothness, flatAreaRadius, transitionEndDist), [noise, smoothness, flatAreaRadius, transitionEndDist])

	// Scratch vector for normal calculations (reused to avoid allocations)
	const normalScratch = useMemo(() => new Vector3(), [])

	// Get terrain height at any world position (in world units)
	const getTerrainHeight = useCallback(
		(worldX, worldZ) => {
			return terrainHelpers.getHeight(worldX, worldZ, maxHeight)
		},
		[terrainHelpers, maxHeight]
	)

	// Get terrain normal at any world position (optionally pass target vector to avoid allocation)
	const getTerrainNormal = useCallback(
		(worldX, worldZ, target = normalScratch) => {
			return terrainHelpers.getNormal(worldX, worldZ, maxHeight, target)
		},
		[terrainHelpers, maxHeight, normalScratch]
	)

	// Update tiles based on vehicle position
	useFrame(() => {
		const centerPosition = vehicleState.position
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

		// Check which tiles should be active
		for (let x = -tilesInViewDistance; x <= tilesInViewDistance; x++) {
			for (let z = -tilesInViewDistance; z <= tilesInViewDistance; z++) {
				const tileX = currentTileX + x
				const tileZ = currentTileZ + z
				const tileKey = `${tileX},${tileZ}`

				// Calculate distance from center position to tile center using simple math
				const tileCenterX = tileX * tileSize + tileSize / 2
				const tileCenterZ = tileZ * tileSize + tileSize / 2
				const dx = centerPosition.x - tileCenterX
				const dz = centerPosition.z - tileCenterZ
				const distanceToTile = Math.sqrt(dx * dx + dz * dz)

				// Add tile if within view distance
				if (distanceToTile <= viewDistance) {
					newActiveTileKeys.add(tileKey)

					// Only create new tile data if not already cached
					if (!tileCache.current.has(tileKey)) {
						tileCache.current.set(tileKey, {
							key: tileKey,
							position: [tileX * tileSize, 0, tileZ * tileSize], // Stable reference
							shouldFade: !isInitialLoad,
						})
					}
				}
			}
		}

		// Remove tiles that are no longer in view from cache
		for (const key of tileCache.current.keys()) {
			if (!newActiveTileKeys.has(key)) {
				tileCache.current.delete(key)
			}
		}

		// Build active tiles array from cache (stable references)
		const newActiveTiles = Array.from(newActiveTileKeys).map((key) => tileCache.current.get(key))
		setActiveTiles(newActiveTiles)
	})

	return (
		<group name='Terrain'>
			<DistantTerrain noise={noise} map={distantTexture} />
			{activeTiles.map(({ key, position, shouldFade }) => (
				<TerrainTile
					key={key}
					position={position}
					shouldFade={shouldFade}
					tileSize={tileSize}
					resolution={resolution}
					maxHeight={maxHeight}
					terrainHelpers={terrainHelpers}
					map={sandTexture}
					normalMap={sandNormalMap}
				/>
			))}
			{showGrass && <Grass getTerrainHeight={getTerrainHeight} getTerrainNormal={getTerrainNormal} />}
		</group>
	)
}

export default Terrain
