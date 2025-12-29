import { useState, useRef, useMemo, useEffect, memo, useCallback } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'
import { RepeatWrapping, PlaneGeometry, Vector3, TextureLoader } from 'three'
import { Noise } from 'noisejs'

import useGameStore, { vehicleState } from '../../../store/gameStore'
import useTerrainCollider from '../../../hooks/useTerrainCollider'

import Grass from './Grass'
import Water from './Water'
import DistantTerrain from './DistantTerrain'

// Ocean configuration
const OCEAN_RADIUS = 1000
const OCEAN_TRANSITION = 80 // Width of the beach transition zone
const OCEAN_DEPTH = 5 // How far below 0 the ocean floor goes

// Beach profile control point (like a Bezier curve)
const BEACH_MIDPOINT_DEPTH = 0.2 // Intermediate depth at transition midpoint (0-1 range)

// Epsilon for numerical gradient approximation
const GRADIENT_EPSILON = 0.01

// Fade-in duration for new tiles (in seconds)
const TILE_FADE_DURATION = 0.5

// Regional height modulation scale (size of flat/hilly regions)
const REGION_SCALE = 240

// LOD configuration - each level defines tile size, resolution, and view distance
// Higher LOD = more detail, lower number = closer to vehicle
const LOD_LEVELS = [
	{ level: 0, tileSize: 32, resolution: 32, viewDistance: 48 }, // Highest detail, physics enabled
	{ level: 1, tileSize: 32, resolution: 16, viewDistance: 96 }, // Medium-high detail
	{ level: 2, tileSize: 64, resolution: 16, viewDistance: 192 }, // Medium detail
	{ level: 3, tileSize: 128, resolution: 16, viewDistance: 384 }, // Low detail, far view
]

// Default terrain configuration
const DEFAULT_TERRAIN_CONFIG = {
	smoothness: 15,
	maxHeight: 4,
}

// Shared terrain height calculation utilities
const createTerrainHelpers = (noise, smoothness, flatAreaRadius, transitionEndDist) => {
	const flatAreaRadiusSq = flatAreaRadius * flatAreaRadius
	const transitionEndDistSq = transitionEndDist * transitionEndDist

	// Ocean boundary calculations
	const oceanTransitionStart = OCEAN_RADIUS - OCEAN_TRANSITION
	const oceanTransitionStartSq = oceanTransitionStart * oceanTransitionStart

	// Get raw height value at any world position (normalized 0-1, can go negative for ocean)
	const getRawHeight = (worldX, worldZ) => {
		const distSq = worldX * worldX + worldZ * worldZ
		if (distSq < flatAreaRadiusSq) return 0

		const noiseValue = noise.perlin2(worldX / smoothness, worldZ / smoothness)
		const normalizedHeight = (noiseValue + 1) / 2

		// Regional height modulation - creates dispersed flatter areas
		const regionNoise = noise.perlin2(worldX / REGION_SCALE + 100, worldZ / REGION_SCALE + 100)
		// Map to 0.1-1.0 range: some areas have 10% height (much flatter), others full height
		const regionModifier = 0.1 + (regionNoise + 1) * 0.45

		let baseHeight
		if (distSq < transitionEndDistSq) {
			const t = (Math.sqrt(distSq) - flatAreaRadius) / (transitionEndDist - flatAreaRadius)
			baseHeight = normalizedHeight * (t * t * (3 - 2 * t)) * regionModifier
		} else {
			baseHeight = normalizedHeight * regionModifier
		}

		// Apply ocean tapering - realistic two-stage beach profile
		if (distSq > oceanTransitionStartSq) {
			const dist = Math.sqrt(distSq)
			if (dist >= OCEAN_RADIUS) {
				// Beyond ocean radius - full ocean depth (normalized)
				return -OCEAN_DEPTH / 4 // Normalize relative to typical maxHeight
			} else {
				// In transition zone - smooth bezier-like curve through control point
				const t = (dist - oceanTransitionStart) / OCEAN_TRANSITION // 0 at shore, 1 at deep ocean

				const oceanFloorHeight = -OCEAN_DEPTH / 4
				const midpointHeight = oceanFloorHeight * BEACH_MIDPOINT_DEPTH

				// Quadratic bezier interpolation: start at baseHeight, through midpoint, to oceanFloorHeight
				// First half: baseHeight → midpoint (gentle slope)
				// Second half: midpoint → oceanFloorHeight (steeper drop)
				const bezierT = t * t * (3 - 2 * t) // Smoothstep for natural curve
				let finalHeight

				if (t < 0.5) {
					// Shallow beach section
					const localT = t * 2 // Map to 0-1
					finalHeight = baseHeight * (1 - localT) + midpointHeight * localT
				} else {
					// Drop-off section
					const localT = (t - 0.5) * 2 // Map to 0-1
					const dropCurve = localT * localT // Quadratic for steeper descent
					finalHeight = midpointHeight * (1 - dropCurve) + oceanFloorHeight * dropCurve
				}

				// Suppress terrain noise as we enter water
				const noiseSuppression = (1 - bezierT) * (1 - bezierT) * (1 - bezierT)
				return baseHeight * noiseSuppression + finalHeight * (1 - noiseSuppression)
			}
		}

		return baseHeight
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

/**
 * Determine which edges of a tile need stitching to a lower LOD neighbor.
 * Returns an object with edge info: { north, south, east, west }
 * Each edge contains: { needsStitch: boolean, neighborStep: number }
 * where neighborStep is the world-space vertex spacing of the coarser grid
 */
const getEdgeStitchInfo = (tileKey, lodLevel, allTiles, tileSize) => {
	const [tileX, tileZ] = tileKey.split(',').map(Number)
	const currentLod = LOD_LEVELS[lodLevel]
	const currentStep = tileSize / currentLod.resolution

	// Tile center in world space
	const tileCenterX = tileX * tileSize + tileSize / 2
	const tileCenterZ = tileZ * tileSize + tileSize / 2

	const edges = {
		north: { needsStitch: false, neighborStep: currentStep }, // +Z edge
		south: { needsStitch: false, neighborStep: currentStep }, // -Z edge
		east: { needsStitch: false, neighborStep: currentStep }, // +X edge
		west: { needsStitch: false, neighborStep: currentStep }, // -X edge
	}

	// Check each neighboring direction for tiles of lower LOD (higher level number)
	// We check by probing world positions just outside our tile edges
	const probeDistance = 1 // Small distance outside tile edge

	const edgeProbes = [
		{ edge: 'north', probeX: tileCenterX, probeZ: tileCenterZ + tileSize / 2 + probeDistance },
		{ edge: 'south', probeX: tileCenterX, probeZ: tileCenterZ - tileSize / 2 - probeDistance },
		{ edge: 'east', probeX: tileCenterX + tileSize / 2 + probeDistance, probeZ: tileCenterZ },
		{ edge: 'west', probeX: tileCenterX - tileSize / 2 - probeDistance, probeZ: tileCenterZ },
	]

	for (const { edge, probeX, probeZ } of edgeProbes) {
		// Check for neighbors at each LOD level (lower detail = higher level number)
		for (let checkLevel = lodLevel + 1; checkLevel < LOD_LEVELS.length; checkLevel++) {
			const checkLod = LOD_LEVELS[checkLevel]
			const checkTileSize = checkLod.tileSize

			// Which tile at this LOD level contains the probe point?
			const neighborTileX = Math.floor(probeX / checkTileSize)
			const neighborTileZ = Math.floor(probeZ / checkTileSize)
			const neighborKey = `${checkLevel}:${neighborTileX},${neighborTileZ}`

			if (allTiles.has(neighborKey)) {
				// Found a lower LOD neighbor - need to stitch this edge
				edges[edge].needsStitch = true
				// Calculate the world-space step of the neighbor's grid
				edges[edge].neighborStep = checkTileSize / checkLod.resolution
				break
			}
		}
	}

	return edges
}

/**
 * Create geometry with LOD edge stitching.
 * For edges that border lower-LOD tiles, we interpolate vertex heights to match
 * the coarser grid. This eliminates T-junctions and gaps.
 *
 * The key insight: when our edge has more vertices than the neighbor's edge,
 * we can't just snap to the neighbor's grid - we must linearly interpolate
 * between the neighbor's vertices to get smooth, gap-free transitions.
 */
const createStitchedGeometry = (tileSize, resolution, maxHeight, position, terrainHelpers, edgeStitchInfo) => {
	const segments = resolution
	const sampleCount = segments + 1
	const totalSamples = sampleCount * sampleCount
	const step = tileSize / segments

	const positions = new Float32Array(totalSamples * 3)
	const normals = new Float32Array(totalSamples * 3)
	const uvs = new Float32Array(totalSamples * 2)

	const normalVec = new Vector3()

	// Helper to get world position from local grid coords
	const getWorldPos = (i, j) => {
		const localX = i * step
		const localZ = j * step
		const worldX = position[0] + localX - tileSize / 2
		const worldZ = position[2] + localZ - tileSize / 2
		return { localX, localZ, worldX, worldZ }
	}

	// Helper to get interpolated height along a stitched edge
	// This samples the coarser grid and interpolates between its vertices
	const getStitchedHeight = (worldX, worldZ, neighborStep, axis) => {
		if (axis === 'x') {
			// Stitching along X axis (for north/south edges)
			const gridX = worldX / neighborStep
			const x0 = Math.floor(gridX) * neighborStep
			const x1 = x0 + neighborStep
			const t = (worldX - x0) / neighborStep

			const h0 = terrainHelpers.getRawHeight(x0, worldZ)
			const h1 = terrainHelpers.getRawHeight(x1, worldZ)
			return (h0 * (1 - t) + h1 * t) * maxHeight
		} else {
			// Stitching along Z axis (for west/east edges)
			const gridZ = worldZ / neighborStep
			const z0 = Math.floor(gridZ) * neighborStep
			const z1 = z0 + neighborStep
			const t = (worldZ - z0) / neighborStep

			const h0 = terrainHelpers.getRawHeight(worldX, z0)
			const h1 = terrainHelpers.getRawHeight(worldX, z1)
			return (h0 * (1 - t) + h1 * t) * maxHeight
		}
	}

	// Generate all vertices
	for (let i = 0; i < sampleCount; i++) {
		for (let j = 0; j < sampleCount; j++) {
			const { localX, localZ, worldX, worldZ } = getWorldPos(i, j)

			// Check if this vertex is on an edge that needs stitching
			const onWestEdge = i === 0
			const onEastEdge = i === segments
			const onSouthEdge = j === 0
			const onNorthEdge = j === segments

			let height

			// Apply edge stitching - interpolate heights along stitched edges
			if (onWestEdge && edgeStitchInfo.west.needsStitch) {
				height = getStitchedHeight(worldX, worldZ, edgeStitchInfo.west.neighborStep, 'z')
			} else if (onEastEdge && edgeStitchInfo.east.needsStitch) {
				height = getStitchedHeight(worldX, worldZ, edgeStitchInfo.east.neighborStep, 'z')
			} else if (onSouthEdge && edgeStitchInfo.south.needsStitch) {
				height = getStitchedHeight(worldX, worldZ, edgeStitchInfo.south.neighborStep, 'x')
			} else if (onNorthEdge && edgeStitchInfo.north.needsStitch) {
				height = getStitchedHeight(worldX, worldZ, edgeStitchInfo.north.neighborStep, 'x')
			} else {
				// Normal sampling for non-stitched vertices
				height = terrainHelpers.getRawHeight(worldX, worldZ) * maxHeight
			}

			// Geometry uses column-major indexing (PlaneGeometry convention)
			const vertIndex = i + sampleCount * j
			const posIndex = vertIndex * 3
			const uvIndex = vertIndex * 2

			// Position: centered around origin
			positions[posIndex] = localX - tileSize / 2
			positions[posIndex + 1] = height
			positions[posIndex + 2] = localZ - tileSize / 2

			// Normal - compute from actual height for visual quality
			terrainHelpers.getNormal(worldX, worldZ, maxHeight, normalVec)
			normals[posIndex] = normalVec.x
			normals[posIndex + 1] = normalVec.y
			normals[posIndex + 2] = normalVec.z

			// UVs - use actual world position for seamless texturing
			uvs[uvIndex] = worldX
			uvs[uvIndex + 1] = worldZ
		}
	}

	// Build geometry
	const geom = new PlaneGeometry(tileSize, tileSize, resolution, resolution)
	geom.getAttribute('position').array.set(positions)
	geom.getAttribute('position').needsUpdate = true
	geom.getAttribute('uv').array.set(uvs)
	geom.getAttribute('uv').needsUpdate = true
	geom.getAttribute('normal').array.set(normals)
	geom.getAttribute('normal').needsUpdate = true

	return geom
}

// Custom comparison for TerrainTile to avoid unnecessary re-renders
const areTerrainTilePropsEqual = (prevProps, nextProps) => {
	// Position comparison - array contents
	if (prevProps.position[0] !== nextProps.position[0] || prevProps.position[1] !== nextProps.position[1] || prevProps.position[2] !== nextProps.position[2]) {
		return false
	}

	// Simple value comparisons
	if (
		prevProps.tileSize !== nextProps.tileSize ||
		prevProps.resolution !== nextProps.resolution ||
		prevProps.maxHeight !== nextProps.maxHeight ||
		prevProps.hasCollider !== nextProps.hasCollider
	) {
		return false
	}

	// Edge stitch info deep comparison
	const prevEdge = prevProps.edgeStitchInfo
	const nextEdge = nextProps.edgeStitchInfo
	if (prevEdge !== nextEdge) {
		if (!prevEdge || !nextEdge) return false
		if (
			prevEdge.north.needsStitch !== nextEdge.north.needsStitch ||
			prevEdge.south.needsStitch !== nextEdge.south.needsStitch ||
			prevEdge.east.needsStitch !== nextEdge.east.needsStitch ||
			prevEdge.west.needsStitch !== nextEdge.west.needsStitch ||
			prevEdge.north.neighborStep !== nextEdge.north.neighborStep ||
			prevEdge.south.neighborStep !== nextEdge.south.neighborStep ||
			prevEdge.east.neighborStep !== nextEdge.east.neighborStep ||
			prevEdge.west.neighborStep !== nextEdge.west.neighborStep
		) {
			return false
		}
	}

	// Reference comparisons for objects that should be stable
	if (prevProps.terrainHelpers !== nextProps.terrainHelpers || prevProps.map !== nextProps.map || prevProps.normalMap !== nextProps.normalMap) {
		return false
	}

	return true
}

// TerrainTile component with LOD support
const TerrainTile = memo(({ position, tileSize, resolution, maxHeight, terrainHelpers, map, normalMap, shouldFade = true, hasCollider = false, edgeStitchInfo }) => {
	const materialRef = useRef()
	// Disable fade animation to debug flashing - tiles appear instantly
	const opacityRef = useRef(1)

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

	// Create height/normal/UV functions that map local coords to world coords
	// This bridges the tile system to the general-purpose terrain collider hook
	const getHeight = useCallback(
		(localX, localZ) => {
			const worldX = position[0] + localX - tileSize / 2
			const worldZ = position[2] + localZ - tileSize / 2
			return terrainHelpers.getRawHeight(worldX, worldZ)
		},
		[position, tileSize, terrainHelpers]
	)

	const getNormal = useCallback(
		(localX, localZ, target) => {
			const worldX = position[0] + localX - tileSize / 2
			const worldZ = position[2] + localZ - tileSize / 2
			return terrainHelpers.getNormal(worldX, worldZ, maxHeight, target)
		},
		[position, tileSize, maxHeight, terrainHelpers]
	)

	const getUV = useCallback(
		(localX, localZ) => {
			// World-space UVs for seamless tiling across tiles
			const worldX = position[0] + localX - tileSize / 2
			const worldZ = position[2] + localZ - tileSize / 2
			return [worldX, worldZ]
		},
		[position, tileSize]
	)

	// Use the terrain collider hook ONLY for tiles that need physics
	// This generates the heightfield data in the format Rapier expects
	const colliderData = useTerrainCollider({
		segments: resolution,
		size: tileSize,
		maxHeight,
		getHeight,
		getNormal,
		getUV,
	})

	// Create a stable key for edge stitch info to use in dependency array
	const edgeStitchKey = useMemo(() => {
		if (!edgeStitchInfo) return 'none'
		const n = edgeStitchInfo.north
		const s = edgeStitchInfo.south
		const e = edgeStitchInfo.east
		const w = edgeStitchInfo.west
		return `${n.needsStitch}:${n.neighborStep},${s.needsStitch}:${s.neighborStep},${e.needsStitch}:${e.neighborStep},${w.needsStitch}:${w.neighborStep}`
	}, [edgeStitchInfo])

	// Create a stable position key since position array reference may change
	const positionKey = `${position[0]},${position[1]},${position[2]}`

	// Create geometry with LOD stitching applied
	const geometry = useMemo(() => {
		return createStitchedGeometry(tileSize, resolution, maxHeight, position, terrainHelpers, edgeStitchInfo)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tileSize, resolution, maxHeight, positionKey, terrainHelpers, edgeStitchKey])

	// Dispose geometry when component unmounts or geometry changes
	useEffect(() => {
		return () => {
			geometry.dispose()
		}
	}, [geometry])

	// Render with or without physics collider based on LOD level
	if (hasCollider) {
		return (
			<RigidBody type='fixed' position={position} colliders={false}>
				<HeightfieldCollider args={colliderData.colliderArgs} name={`Tile-${position[0]}-${position[2]}`} />
				<mesh geometry={geometry} receiveShadow>
					<meshStandardMaterial ref={materialRef} map={map} normalMap={normalMap} transparent={opacityRef.current < 1} opacity={opacityRef.current} />
				</mesh>
			</RigidBody>
		)
	}

	// No physics - just visual mesh
	return (
		<mesh geometry={geometry} position={position} receiveShadow>
			<meshStandardMaterial ref={materialRef} map={map} normalMap={normalMap} transparent={opacityRef.current < 1} opacity={opacityRef.current} />
		</mesh>
	)
}, areTerrainTilePropsEqual)

// Distance from ocean edge at which water starts loading (with hysteresis buffer)
const WATER_LOAD_DISTANCE = 400 // Start loading water when this close to ocean edge
const WATER_UNLOAD_BUFFER = 100 // Extra distance before unloading to prevent flicker

// Default edge stitch info (no stitching needed)
const DEFAULT_EDGE_STITCH_INFO = {
	north: { needsStitch: false, neighborStep: 1 },
	south: { needsStitch: false, neighborStep: 1 },
	east: { needsStitch: false, neighborStep: 1 },
	west: { needsStitch: false, neighborStep: 1 },
}

// Main Terrain component with multi-LOD support
const Terrain = () => {
	const { smoothness, maxHeight } = DEFAULT_TERRAIN_CONFIG
	const [activeTiles, setActiveTiles] = useState([])
	const [showWater, setShowWater] = useState(false)
	const lastUpdatePosition = useRef({ x: null, z: null })
	const tileCache = useRef(new Map()) // Cache tile data to maintain stable references
	const allTilesRef = useRef(new Set()) // Track all active tile keys for edge stitching

	// Check if grass should be disabled (performance degraded, or mobile device)
	const isMobile = useGameStore((state) => state.isMobile)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const showGrass = !performanceDegraded && !isMobile

	// Generate noise instance
	const noise = useMemo(() => new Noise(1234), [])

	const [sandTexture, sandNormalMap] = useLoader(TextureLoader, ['/assets/images/ground/sand.jpg', '/assets/images/ground/sand_normal.jpg'])

	const distantTexture = useMemo(() => sandTexture.clone(), [sandTexture])

	// Flat area and transition parameters (use smallest tile size for flat area)
	const flatAreaRadius = LOD_LEVELS[0].tileSize * 0.5
	const transitionEndDist = LOD_LEVELS[0].tileSize * 2

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
	useFrame((state) => {
		const centerPosition = vehicleState.position

		// Use a smaller threshold for updates to catch all tile changes
		const updateThreshold = LOD_LEVELS[0].tileSize / 2
		const dx = centerPosition.x - (lastUpdatePosition.current.x || 0)
		const dz = centerPosition.z - (lastUpdatePosition.current.z || 0)
		const movedDistance = Math.sqrt(dx * dx + dz * dz)

		// Only update tiles if moved enough
		if (movedDistance < updateThreshold && lastUpdatePosition.current.x !== null) {
			return
		}
		lastUpdatePosition.current.x = centerPosition.x
		lastUpdatePosition.current.z = centerPosition.z

		const newActiveTileKeys = new Set()
		const newAllTileKeys = new Set()
		const isInitialLoad = tileCache.current.size === 0

		// Track which world areas are covered by each LOD level
		// We'll use this to prevent overlapping tiles
		const coveredAreas = new Map() // key: "worldX,worldZ" at finest grid, value: lodLevel

		// Process each LOD level, from highest detail (0) to lowest
		// Higher detail LODs get priority and "claim" their areas first
		for (let levelIndex = 0; levelIndex < LOD_LEVELS.length; levelIndex++) {
			const { level, tileSize, resolution, viewDistance } = LOD_LEVELS[levelIndex]

			// Calculate tile range for this LOD level
			const tilesInView = Math.ceil(viewDistance / tileSize) + 1

			for (let x = -tilesInView; x <= tilesInView; x++) {
				for (let z = -tilesInView; z <= tilesInView; z++) {
					const tileX = Math.floor(centerPosition.x / tileSize) + x
					const tileZ = Math.floor(centerPosition.z / tileSize) + z

					// Calculate tile world position (center of tile)
					const tileCenterX = tileX * tileSize + tileSize / 2
					const tileCenterZ = tileZ * tileSize + tileSize / 2
					const distX = centerPosition.x - tileCenterX
					const distZ = centerPosition.z - tileCenterZ
					const distanceToTile = Math.sqrt(distX * distX + distZ * distZ)

					// Only include tiles within this LOD's view distance
					if (distanceToTile <= viewDistance) {
						// Check if this tile's area is already covered by a higher-detail LOD tile
						// We use the tile's corner as the key to check coverage
						const tileWorldX = tileX * tileSize
						const tileWorldZ = tileZ * tileSize
						const coverageKey = `${Math.floor(tileWorldX / LOD_LEVELS[0].tileSize)},${Math.floor(tileWorldZ / LOD_LEVELS[0].tileSize)}`

						// For LOD 0, always add (highest priority)
						// For other LODs, only add if not already covered by a higher LOD
						let shouldAdd = false

						if (levelIndex === 0) {
							shouldAdd = true
							// Mark this area as covered by LOD 0
							coveredAreas.set(coverageKey, level)
						} else {
							// Check if any part of this larger tile is already covered
							// We need to check all the smaller tiles this would overlap
							const smallTileSize = LOD_LEVELS[0].tileSize
							const tilesPerSide = tileSize / smallTileSize
							let fullyCovered = true

							for (let sx = 0; sx < tilesPerSide; sx++) {
								for (let sz = 0; sz < tilesPerSide; sz++) {
									const checkX = Math.floor(tileWorldX / smallTileSize) + sx
									const checkZ = Math.floor(tileWorldZ / smallTileSize) + sz
									const checkKey = `${checkX},${checkZ}`
									if (!coveredAreas.has(checkKey)) {
										fullyCovered = false
									}
								}
							}

							if (!fullyCovered) {
								shouldAdd = true
								// Mark all sub-tiles as covered
								for (let sx = 0; sx < tilesPerSide; sx++) {
									for (let sz = 0; sz < tilesPerSide; sz++) {
										const markX = Math.floor(tileWorldX / smallTileSize) + sx
										const markZ = Math.floor(tileWorldZ / smallTileSize) + sz
										const markKey = `${markX},${markZ}`
										if (!coveredAreas.has(markKey)) {
											coveredAreas.set(markKey, level)
										}
									}
								}
							}
						}

						if (shouldAdd) {
							const tileKey = `${level}:${tileX},${tileZ}`
							newActiveTileKeys.add(tileKey)
							newAllTileKeys.add(tileKey)

							// Only create new tile data if not already cached
							if (!tileCache.current.has(tileKey)) {
								tileCache.current.set(tileKey, {
									key: tileKey,
									lodLevel: level,
									tileSize,
									resolution,
									position: [tileX * tileSize + tileSize / 2, 0, tileZ * tileSize + tileSize / 2],
									shouldFade: !isInitialLoad,
									hasCollider: level === 0, // Only highest LOD gets physics colliders
								})
							}
						}
					}
				}
			}
		}

		// Update the all tiles reference for edge stitching calculations
		allTilesRef.current = newAllTileKeys

		// Remove tiles that are no longer in view from cache
		for (const key of tileCache.current.keys()) {
			if (!newActiveTileKeys.has(key)) {
				tileCache.current.delete(key)
			}
		}

		// Update edge stitch info for tiles that need it
		for (const key of newActiveTileKeys) {
			const tile = tileCache.current.get(key)
			const [, coords] = key.split(':')
			const newEdgeStitchInfo = getEdgeStitchInfo(coords, tile.lodLevel, newAllTileKeys, tile.tileSize)

			// Always set the edge stitch info (the tile's memo will handle whether to re-render)
			if (!tile.edgeStitchInfo) {
				tile.edgeStitchInfo = newEdgeStitchInfo
			} else {
				// Only update if values changed to preserve reference stability
				const oldInfo = tile.edgeStitchInfo
				if (
					oldInfo.north.needsStitch !== newEdgeStitchInfo.north.needsStitch ||
					oldInfo.south.needsStitch !== newEdgeStitchInfo.south.needsStitch ||
					oldInfo.east.needsStitch !== newEdgeStitchInfo.east.needsStitch ||
					oldInfo.west.needsStitch !== newEdgeStitchInfo.west.needsStitch ||
					oldInfo.north.neighborStep !== newEdgeStitchInfo.north.neighborStep ||
					oldInfo.south.neighborStep !== newEdgeStitchInfo.south.neighborStep ||
					oldInfo.east.neighborStep !== newEdgeStitchInfo.east.neighborStep ||
					oldInfo.west.neighborStep !== newEdgeStitchInfo.west.neighborStep
				) {
					tile.edgeStitchInfo = newEdgeStitchInfo
				}
			}
		}

		// Check if the tile set actually changed
		const newTileArray = Array.from(newActiveTileKeys).map((key) => tileCache.current.get(key))

		setActiveTiles((prevTiles) => {
			// If same tiles (by key), return previous to avoid re-render
			if (prevTiles.length === newTileArray.length) {
				const prevKeys = new Set(prevTiles.map((t) => t.key))
				const allSame = newTileArray.every((t) => prevKeys.has(t.key))
				if (allSame) {
					// Return new array with updated tile objects (same keys but potentially updated stitch info)
					// This ensures tiles get the latest edgeStitchInfo without creating all new tiles
					return newTileArray
				}
			}
			return newTileArray
		})

		// Check if player is close enough to ocean to show water
		const distFromOrigin = Math.sqrt(centerPosition.x * centerPosition.x + centerPosition.z * centerPosition.z)
		const distFromOcean = OCEAN_RADIUS - distFromOrigin

		// Use hysteresis to prevent flicker at boundary
		setShowWater((wasShowing) => {
			if (wasShowing) {
				// Already showing - only hide if we've moved far enough away
				return distFromOcean < WATER_LOAD_DISTANCE + WATER_UNLOAD_BUFFER
			} else {
				// Not showing - show when we get close enough
				return distFromOcean < WATER_LOAD_DISTANCE
			}
		})
	})

	return (
		<group name='Terrain'>
			<DistantTerrain noise={noise} map={distantTexture} />
			{showWater && <Water oceanRadius={OCEAN_RADIUS} oceanTransition={OCEAN_TRANSITION} />}
			{activeTiles.map(({ key, position, shouldFade, lodLevel, tileSize, resolution, hasCollider, edgeStitchInfo }) => (
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
					hasCollider={hasCollider}
					edgeStitchInfo={edgeStitchInfo || DEFAULT_EDGE_STITCH_INFO}
				/>
			))}
			{showGrass && <Grass getTerrainHeight={getTerrainHeight} getTerrainNormal={getTerrainNormal} />}
		</group>
	)
}

export default Terrain
