import { useState, useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'
import { RepeatWrapping, PlaneGeometry, RingGeometry, Color, BufferAttribute, Vector3 } from 'three'
import { Noise } from 'noisejs'

import useGameStore from '../store/gameStore'

// Epsilon for numerical gradient approximation
const GRADIENT_EPSILON = 0.01

// Fade-in duration for new tiles (in seconds)
const TILE_FADE_DURATION = 0.5

// Default terrain configuration
const DEFAULT_TERRAIN_CONFIG = {
	viewDistance: 160,
	tileSize: 32,
	resolution: 16,
	smoothness: 15,
	maxHeight: 4,
}

// Distant terrain configuration
const DISTANT_TERRAIN_CONFIG = {
	innerRadius: 150,
	outerRadius: 600,
	segments: 128,
	rings: 32,
	maxHeight: 50,
	baseHeight: -10,
	noiseScale: 0.008,
	peakSharpness: 2.5,
}

// TerrainTile component
const TerrainTile = ({ position, tileSize, resolution, smoothness, maxHeight, noise, shouldFade = true }) => {
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

	// Load texture
	const textures = useTexture({
		map: 'assets/images/ground/sand.jpg',
		normalMap: 'assets/images/ground/sand_normal.jpg',
	})
	// Apply texture settings - UVs are now in world coordinates, so repeat controls texture density
	useMemo(() => {
		textures.map.wrapS = textures.map.wrapT = RepeatWrapping
		textures.map.repeat.set(1, 1) // 1 texture unit per world unit
		textures.normalMap.wrapS = textures.normalMap.wrapT = RepeatWrapping
		textures.normalMap.repeat.set(0.33, 0.33) // Larger scale for normal map details
	}, [textures])

	// Helper to compute height at any world position (for gradient calculation)
	const getHeightAtPosition = (worldX, worldZ, flatAreaRadiusSq, transitionEndDistSq, isCenterTile) => {
		const distSq = worldX * worldX + worldZ * worldZ
		if (distSq < flatAreaRadiusSq) return 0

		const noiseValue = noise.perlin2(worldX / smoothness, worldZ / smoothness)
		const normalizedHeight = (noiseValue + 1) / 2

		if (isCenterTile || distSq < transitionEndDistSq) {
			const t = (Math.sqrt(distSq) - Math.sqrt(flatAreaRadiusSq)) / (Math.sqrt(transitionEndDistSq) - Math.sqrt(flatAreaRadiusSq))
			return normalizedHeight * (t * t * (3 - 2 * t))
		}
		return normalizedHeight
	}

	// Generate heights, UVs, and normals together to avoid redundant calculations
	const heights = useMemo(() => {
		const values = []
		const vertexCount = (resolution + 1) * (resolution + 1)
		const positions = new Float32Array(vertexCount * 3)
		const uvs = new Float32Array(vertexCount * 2)
		const normals = new Float32Array(vertexCount * 3)
		const flatAreaRadiusSq = (tileSize * 0.5) ** 2
		const transitionEndDistSq = (tileSize * 2) ** 2
		const step = tileSize / resolution
		const tileX = Math.floor(position[0] / tileSize)
		const tileZ = Math.floor(position[2] / tileSize)
		const isCenterTile = tileX >= -1 && tileX <= 0 && tileZ >= -1 && tileZ <= 0

		const normal = new Vector3()

		for (let i = 0; i <= resolution; i++) {
			for (let j = 0; j <= resolution; j++) {
				const worldX = position[0] + i * step - tileSize / 2
				const worldZ = position[2] + j * step - tileSize / 2

				const height = getHeightAtPosition(worldX, worldZ, flatAreaRadiusSq, transitionEndDistSq, isCenterTile)
				values.push(height)

				const vertIndex = i + (resolution + 1) * j
				const posIndex = vertIndex * 3
				positions[posIndex] = (i / resolution) * tileSize - tileSize / 2
				positions[posIndex + 1] = height * maxHeight
				positions[posIndex + 2] = (j / resolution) * tileSize - tileSize / 2

				// Compute normal analytically using finite differences on the height function
				const hL = getHeightAtPosition(worldX - GRADIENT_EPSILON, worldZ, flatAreaRadiusSq, transitionEndDistSq, isCenterTile) * maxHeight
				const hR = getHeightAtPosition(worldX + GRADIENT_EPSILON, worldZ, flatAreaRadiusSq, transitionEndDistSq, isCenterTile) * maxHeight
				const hD = getHeightAtPosition(worldX, worldZ - GRADIENT_EPSILON, flatAreaRadiusSq, transitionEndDistSq, isCenterTile) * maxHeight
				const hU = getHeightAtPosition(worldX, worldZ + GRADIENT_EPSILON, flatAreaRadiusSq, transitionEndDistSq, isCenterTile) * maxHeight

				// Normal from gradient: n = normalize(-dh/dx, 1, -dh/dz)
				const dhdx = (hR - hL) / (2 * GRADIENT_EPSILON)
				const dhdz = (hU - hD) / (2 * GRADIENT_EPSILON)
				normal.set(-dhdx, 1, -dhdz).normalize()

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
	}, [position, tileSize, resolution, smoothness, noise, maxHeight])

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

	// Set collider arguments
	const colliderArgs = useMemo(() => {
		return [resolution, resolution, heights.values, { x: tileSize, y: maxHeight, z: tileSize }]
	}, [resolution, heights, tileSize, maxHeight])

	return (
		<RigidBody type='fixed' position={position} colliders={false}>
			<HeightfieldCollider args={colliderArgs} name={`Tile-${position[0]}-${position[2]}`} />
			<mesh geometry={geometry} receiveShadow>
				<meshStandardMaterial ref={materialRef} {...textures} transparent={opacityRef.current < 1} opacity={opacityRef.current} />
			</mesh>
		</RigidBody>
	)
}

// DistantTerrain component - creates a ring of distant mountains/dunes that follow the camera
const DistantTerrain = ({ noise }) => {
	const { innerRadius, outerRadius, segments, rings, maxHeight, baseHeight, noiseScale, peakSharpness } = DISTANT_TERRAIN_CONFIG
	const meshRef = useRef()
	const baseColor = new Color(0xc2a278),
		peakColor = new Color(0xd4c4a8),
		shadowColor = new Color(0x8b7355)

	const texture = useTexture('assets/images/ground/sand.jpg')
	useMemo(() => {
		texture.wrapS = texture.wrapT = RepeatWrapping
		texture.repeat.set(32, 32)
	}, [texture])

	// Helper to compute height at any position (for gradient calculation)
	const getDistantHeight = (x, z) => {
		const dist = Math.sqrt(x * x + z * z)
		if (dist < innerRadius || dist > outerRadius) return baseHeight

		const normalizedDist = (dist - innerRadius) / (outerRadius - innerRadius)

		const rawNoise =
			noise.perlin2(x * noiseScale, z * noiseScale) +
			noise.perlin2(x * noiseScale * 2, z * noiseScale * 2) * 0.5 +
			noise.perlin2(x * noiseScale * 4, z * noiseScale * 4) * 0.25
		const noiseValue = Math.pow((rawNoise + 1.75) / 3.5, peakSharpness)

		return baseHeight + noiseValue * maxHeight * Math.sin(normalizedDist * Math.PI)
	}

	const geometry = useMemo(() => {
		const geom = new RingGeometry(innerRadius, outerRadius, segments, rings)
		geom.rotateX(-Math.PI / 2)

		const positions = geom.getAttribute('position')
		const normals = geom.getAttribute('normal')
		const colors = new Float32Array(positions.count * 3)
		const normal = new Vector3()

		for (let i = 0; i < positions.count; i++) {
			const x = positions.getX(i),
				z = positions.getZ(i)

			const height = getDistantHeight(x, z)
			positions.setY(i, height)

			// Compute normal analytically using finite differences
			const hL = getDistantHeight(x - GRADIENT_EPSILON, z)
			const hR = getDistantHeight(x + GRADIENT_EPSILON, z)
			const hD = getDistantHeight(x, z - GRADIENT_EPSILON)
			const hU = getDistantHeight(x, z + GRADIENT_EPSILON)

			const dhdx = (hR - hL) / (2 * GRADIENT_EPSILON)
			const dhdz = (hU - hD) / (2 * GRADIENT_EPSILON)
			normal.set(-dhdx, 1, -dhdz).normalize()

			normals.setXYZ(i, normal.x, normal.y, normal.z)

			// Height-based coloring
			const heightFactor = height / maxHeight
			const color = baseColor.clone().lerp(heightFactor > 0.5 ? peakColor : shadowColor, heightFactor > 0.5 ? (heightFactor - 0.5) * 2 : (0.5 - heightFactor) * 0.5)
			colors.set([color.r, color.g, color.b], i * 3)
		}

		geom.setAttribute('color', new BufferAttribute(colors, 3))
		normals.needsUpdate = true
		return geom
	}, [innerRadius, outerRadius, segments, rings, noise, maxHeight, noiseScale, peakSharpness])

	useFrame(() => {
		const cameraTarget = useGameStore.getState().cameraTarget
		if (meshRef.current && cameraTarget) {
			meshRef.current.position.x = cameraTarget.x
			meshRef.current.position.z = cameraTarget.z
		}
	})

	return (
		<mesh ref={meshRef} geometry={geometry} receiveShadow>
			<meshStandardMaterial map={texture} vertexColors roughness={0.9} metalness={0} />
		</mesh>
	)
}

// Main TerrainManager component
const TerrainManager = () => {
	const { viewDistance, tileSize, resolution, smoothness, maxHeight } = DEFAULT_TERRAIN_CONFIG
	const [activeTiles, setActiveTiles] = useState([])
	const loadedTiles = useRef(new Map())
	const tilesInViewDistance = Math.ceil(viewDistance / tileSize)
	const lastTileCoord = useRef({ x: null, z: null })
	const initialLoad = useRef(true)

	// Generate noise instance
	const noise = useMemo(() => new Noise(1234), [])

	// Update tiles based on camera target position
	useFrame(() => {
		// Use camera target position if available, otherwise fall back to scene center
		const centerPosition = useGameStore.getState().cameraTarget
		const currentTileX = Math.floor(centerPosition.x / tileSize)
		const currentTileZ = Math.floor(centerPosition.z / tileSize)

		// Only update tiles if the center position moved to a new tile
		if (currentTileX === lastTileCoord.current.x && currentTileZ === lastTileCoord.current.z) {
			return
		}
		lastTileCoord.current = { x: currentTileX, z: currentTileZ }

		const newActiveTiles = []
		const tilesToLoad = new Map()

		// Check which tiles should be active
		for (let x = -tilesInViewDistance; x <= tilesInViewDistance; x++) {
			for (let z = -tilesInViewDistance; z <= tilesInViewDistance; z++) {
				const tileX = currentTileX + x
				const tileZ = currentTileZ + z
				const position = [tileX * tileSize, 0, tileZ * tileSize]
				const tileKey = `${tileX},${tileZ}`

				// Calculate distance from center position to tile center using simple math
				const tileCenterX = tileX * tileSize + tileSize / 2
				const tileCenterZ = tileZ * tileSize + tileSize / 2
				const dx = centerPosition.x - tileCenterX
				const dz = centerPosition.z - tileCenterZ
				const distanceToTile = Math.sqrt(dx * dx + dz * dz)

				// Add tile if within view distance
				if (distanceToTile <= viewDistance) {
					newActiveTiles.push(tileKey)
					if (!loadedTiles.current.has(tileKey)) {
						tilesToLoad.set(tileKey, position)
					}
				}
			}
		}

		// Update loaded tiles if changes detected
		if (tilesToLoad.size > 0 || loadedTiles.current.size !== newActiveTiles.length) {
			// Create new map with only active tiles
			const updatedLoadedTiles = new Map()

			// Keep existing tiles that are still active
			for (const key of newActiveTiles) {
				if (loadedTiles.current.has(key)) {
					updatedLoadedTiles.set(key, loadedTiles.current.get(key))
				}
			}

			// Add new tiles
			tilesToLoad.forEach((position, key) => {
				updatedLoadedTiles.set(key, { position, shouldFade: !initialLoad.current })
			})

			if (initialLoad.current && updatedLoadedTiles.size > 0) {
				initialLoad.current = false
			}

			// Update state
			loadedTiles.current = updatedLoadedTiles
			setActiveTiles([...updatedLoadedTiles.entries()])
		}
	})

	return (
		<group name='TerrainManager'>
			<DistantTerrain noise={noise} />
			{activeTiles.map(([key, { position, shouldFade }]) => (
				<TerrainTile
					key={key}
					position={position}
					shouldFade={shouldFade}
					tileSize={tileSize}
					resolution={resolution}
					smoothness={smoothness}
					maxHeight={maxHeight}
					noise={noise}
				/>
			))}
		</group>
	)
}

export default TerrainManager
