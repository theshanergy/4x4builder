import { useState, useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'
import { useTexture } from '@react-three/drei'
import { Vector2, RepeatWrapping, PlaneGeometry } from 'three'
import { Noise } from 'noisejs'

// Default terrain configuration
const DEFAULT_TERRAIN_CONFIG = {
    viewDistance: 160,
    tileSize: 32,
    resolution: 16,
    smoothness: 15,
    maxHeight: 2,
}

// TerrainTile component
const TerrainTile = ({ position, tileSize, resolution, smoothness, maxHeight, noise }) => {
    // Load texture
    const textures = useTexture({
        map: 'assets/images/ground/dirt_01.png',
        normalMap: 'assets/images/ground/dirt_01_nrm.png',
    })
    // Apply texture settings
    useMemo(() => {
        const textureRepeat = tileSize / 3
        Object.values(textures).forEach((texture) => {
            texture.wrapS = texture.wrapT = RepeatWrapping
            texture.repeat.set(textureRepeat, textureRepeat)
        })
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
                const worldX = position[0] + i * step - tileSize / 2;
                const worldZ = position[2] + j * step - tileSize / 2;
                
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

    return (
        <RigidBody type='fixed' position={position} colliders={false}>
            <HeightfieldCollider args={[resolution, resolution, heights.values, { x: tileSize, y: maxHeight, z: tileSize }]} name={`Tile-${position[0]}-${position[2]}`} />
            <mesh geometry={geometry} receiveShadow>
                <meshStandardMaterial {...textures} />
            </mesh>
        </RigidBody>
    )
}

// Main TerrainManager component
const TerrainManager = () => {
    const { viewDistance, tileSize, resolution, smoothness, maxHeight } = DEFAULT_TERRAIN_CONFIG
    const { camera } = useThree()
    const [activeTiles, setActiveTiles] = useState([])
    const loadedTiles = useRef(new Map())
    const seed = useRef(Math.random())
    const tilesInViewDistance = Math.ceil(viewDistance / tileSize)
    const lastTileCoord = useRef({ x: null, z: null })

    // Generate noise instance
    const noise = useMemo(() => new Noise(seed.current), [])

    // Update tiles based on camera position
    useFrame(() => {
        const cameraPosition = camera.position
        const currentTileX = Math.floor(cameraPosition.x / tileSize)
        const currentTileZ = Math.floor(cameraPosition.z / tileSize)

        // Only update tiles if the camera moved to a new tile
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

                // Calculate distance from camera to tile center
                const tileCenter = new Vector2(tileX * tileSize + tileSize / 2, tileZ * tileSize + tileSize / 2)
                const distanceToTile = new Vector2(cameraPosition.x, cameraPosition.z).distanceTo(tileCenter)

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
