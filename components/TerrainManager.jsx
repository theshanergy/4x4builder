import { useState, useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'
import { Vector2, RepeatWrapping, PlaneGeometry, RingGeometry, Color, BufferAttribute } from 'three'
import { Noise } from 'noisejs'

import useGameStore from '../store/gameStore'

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
    const [opacity, setOpacity] = useState(shouldFade ? 0 : 1)

    // Animate opacity from 0 to 1 when tile is created
    useFrame((_, delta) => {
        if (shouldFade && opacity < 1) {
            setOpacity((prev) => Math.min(1, prev + delta / TILE_FADE_DURATION))
        }
    })

    // Update material opacity
    useEffect(() => {
        if (materialRef.current) {
            materialRef.current.opacity = opacity
            materialRef.current.transparent = opacity < 1
        }
    }, [opacity])

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

    // Generate heights
    const heights = useMemo(() => {
        const values = []
        const positions = new Float32Array((resolution + 1) * (resolution + 1) * 3)
        const flatAreaRadiusSq = (tileSize * 0.5) ** 2
        const transitionEndDistSq = (tileSize * 2) ** 2
        const step = tileSize / resolution
        const tileX = Math.floor(position[0] / tileSize)
        const tileZ = Math.floor(position[2] / tileSize)
        const isCenterTile = tileX >= -1 && tileX <= 0 && tileZ >= -1 && tileZ <= 0

        for (let i = 0; i <= resolution; i++) {
            for (let j = 0; j <= resolution; j++) {
                const worldX = position[0] + i * step - tileSize / 2
                const worldZ = position[2] + j * step - tileSize / 2

                const distSq = worldX * worldX + worldZ * worldZ

                let height = 0
                if (distSq >= flatAreaRadiusSq) {
                    const noiseValue = noise.perlin2(worldX / smoothness, worldZ / smoothness)
                    const normalizedHeight = (noiseValue + 1) / 2
                    if (isCenterTile || distSq < transitionEndDistSq) {
                        const t = (Math.sqrt(distSq) - Math.sqrt(flatAreaRadiusSq)) / (Math.sqrt(transitionEndDistSq) - Math.sqrt(flatAreaRadiusSq))
                        height = normalizedHeight * (t * t * (3 - 2 * t))
                    } else {
                        height = normalizedHeight
                    }
                }
                values.push(height)

                const vertIndex = (i + (resolution + 1) * j) * 3
                positions[vertIndex] = (i / resolution) * tileSize - tileSize / 2
                positions[vertIndex + 1] = height * maxHeight
                positions[vertIndex + 2] = (j / resolution) * tileSize - tileSize / 2
            }
        }

        return { values, positions }
    }, [position, tileSize, resolution, smoothness, noise, maxHeight])

    // Create geometry for terrain mesh
    const geometry = useMemo(() => {
        const geom = new PlaneGeometry(tileSize, tileSize, resolution, resolution)
        geom.getAttribute('position').array.set(heights.positions)
        
        // Recalculate UVs based on world position for seamless tiling
        const uvs = geom.getAttribute('uv')
        for (let i = 0; i <= resolution; i++) {
            for (let j = 0; j <= resolution; j++) {
                const vertIndex = i + (resolution + 1) * j
                // Calculate world position for this vertex
                const worldX = position[0] + (i / resolution) * tileSize - tileSize / 2
                const worldZ = position[2] + (j / resolution) * tileSize - tileSize / 2
                // Set UV based on world position (scaled for texture repeat)
                uvs.setXY(vertIndex, worldX, worldZ)
            }
        }
        uvs.needsUpdate = true
        
        geom.computeVertexNormals()
        return geom
    }, [heights, tileSize, resolution, position])

    // Set collider arguments
    const colliderArgs = useMemo(() => {
        return [resolution, resolution, heights.values, { x: tileSize, y: maxHeight, z: tileSize }]
    }, [resolution, heights, tileSize, maxHeight])

    return (
        <RigidBody type='fixed' position={position} colliders={false}>
            <HeightfieldCollider args={colliderArgs} name={`Tile-${position[0]}-${position[2]}`} />
            <mesh geometry={geometry} receiveShadow>
                <meshStandardMaterial ref={materialRef} {...textures} transparent opacity={opacity} />
            </mesh>
        </RigidBody>
    )
}

// DistantTerrain component - creates a ring of distant mountains/dunes that follow the camera
const DistantTerrain = ({ noise }) => {
    const { innerRadius, outerRadius, segments, rings, maxHeight, baseHeight, noiseScale, peakSharpness } = DISTANT_TERRAIN_CONFIG
    const meshRef = useRef()

    // Load texture for distant terrain
    const textures = useTexture({
        map: 'assets/images/ground/sand.jpg',
    })
    useMemo(() => {
        textures.map.wrapS = textures.map.wrapT = RepeatWrapping
        textures.map.repeat.set(32, 32)
    }, [textures])

    // Create the ring geometry with procedural heights
    const geometry = useMemo(() => {
        const geom = new RingGeometry(innerRadius, outerRadius, segments, rings)

        // Rotate to be horizontal
        geom.rotateX(-Math.PI / 2)

        const positions = geom.getAttribute('position')
        const colors = new Float32Array(positions.count * 3)

        // Desert colors for gradient
        const baseColor = new Color(0xc2a278)
        const peakColor = new Color(0xd4c4a8)
        const shadowColor = new Color(0x8b7355)

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i)
            const z = positions.getZ(i)

            // Calculate distance from center for height falloff
            const distFromCenter = Math.sqrt(x * x + z * z)
            const normalizedDist = (distFromCenter - innerRadius) / (outerRadius - innerRadius)

            // Multiple octaves of noise for more interesting terrain
            let noiseValue = 0
            noiseValue += noise.perlin2(x * noiseScale, z * noiseScale) * 1.0
            noiseValue += noise.perlin2(x * noiseScale * 2, z * noiseScale * 2) * 0.5
            noiseValue += noise.perlin2(x * noiseScale * 4, z * noiseScale * 4) * 0.25

            // Normalize and apply peak sharpness for more defined ridges
            noiseValue = (noiseValue + 1.75) / 3.5
            noiseValue = Math.pow(noiseValue, peakSharpness)

            // Height falloff - taller in the middle of the ring, fading at edges
            const edgeFalloff = Math.sin(normalizedDist * Math.PI)
            const height = baseHeight + noiseValue * maxHeight * edgeFalloff

            positions.setY(i, height)

            // Color based on height - lighter at peaks, darker in valleys
            const heightFactor = height / maxHeight
            const color = baseColor.clone()
            if (heightFactor > 0.5) {
                color.lerp(peakColor, (heightFactor - 0.5) * 2)
            } else {
                color.lerp(shadowColor, (0.5 - heightFactor) * 0.5)
            }

            colors[i * 3] = color.r
            colors[i * 3 + 1] = color.g
            colors[i * 3 + 2] = color.b
        }

        geom.setAttribute('color', new BufferAttribute(colors, 3))
        geom.computeVertexNormals()

        return geom
    }, [innerRadius, outerRadius, segments, rings, noise, maxHeight, noiseScale, peakSharpness])

    // Follow camera position
    useFrame(() => {
        const cameraTarget = useGameStore.getState().cameraTarget
        if (meshRef.current && cameraTarget) {
            meshRef.current.position.x = cameraTarget.x
            meshRef.current.position.z = cameraTarget.z
        }
    })

    return (
        <mesh ref={meshRef} geometry={geometry} receiveShadow>
            <meshStandardMaterial
                {...textures}
                vertexColors
                roughness={0.9}
                metalness={0.0}
            />
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
    const noise = useMemo(() => new Noise(123), [])

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

                // Calculate distance from center position to tile center
                const tileCenter = new Vector2(tileX * tileSize + tileSize / 2, tileZ * tileSize + tileSize / 2)
                const distanceToTile = new Vector2(centerPosition.x, centerPosition.z).distanceTo(tileCenter)

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
                <TerrainTile key={key} position={position} shouldFade={shouldFade} tileSize={tileSize} resolution={resolution} smoothness={smoothness} maxHeight={maxHeight} noise={noise} />
            ))}
        </group>
    )
}

export default TerrainManager
