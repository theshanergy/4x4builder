import { useState, useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'
import { Vector2, RepeatWrapping, PlaneGeometry, Vector3 } from 'three'
import { Noise } from 'noisejs'

import useGameStore from '../store/gameStore'

// Default terrain configuration
const DEFAULT_TERRAIN_CONFIG = {
    viewDistance: 160,
    tileSize: 32,
    resolution: 16,
    smoothness: 15,
    maxHeight: 4,
}

// TerrainTile component
const TerrainTile = ({ position, tileSize, resolution, smoothness, maxHeight, noise }) => {
    // Load texture
    const textures = useTexture({
        map: 'assets/images/ground/sand.jpg',
        normalMap: 'assets/images/ground/sand_normal.jpg',
    })
    // Apply texture settings
    useMemo(() => {
        textures.map.wrapS = textures.map.wrapT = RepeatWrapping
        textures.map.repeat.set(tileSize, tileSize)
        textures.normalMap.wrapS = textures.normalMap.wrapT = RepeatWrapping
        textures.normalMap.repeat.set(tileSize / 3, tileSize / 3)
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
        geom.computeVertexNormals()
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
                <meshStandardMaterial {...textures} />
            </mesh>
        </RigidBody>
    )
}

// Main TerrainManager component
const TerrainManager = () => {
    const { viewDistance, tileSize, resolution, smoothness, maxHeight } = DEFAULT_TERRAIN_CONFIG
    const [activeTiles, setActiveTiles] = useState([])
    const loadedTiles = useRef(new Map())
    const tilesInViewDistance = Math.ceil(viewDistance / tileSize)
    const lastTileCoord = useRef({ x: null, z: null })

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
                updatedLoadedTiles.set(key, position)
            })

            // Update state
            loadedTiles.current = updatedLoadedTiles
            setActiveTiles([...updatedLoadedTiles.entries()])
        }
    })

    return (
        <group name='TerrainManager'>
            {activeTiles.map(([key, position]) => (
                <TerrainTile key={key} position={position} tileSize={tileSize} resolution={resolution} smoothness={smoothness} maxHeight={maxHeight} noise={noise} />
            ))}
        </group>
    )
}

export default TerrainManager
