import { useState, useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RepeatWrapping, BufferAttribute, BufferGeometry, Vector2 } from 'three'
import { useTexture } from '@react-three/drei'
import { Noise } from 'noisejs'
import { RigidBody, TrimeshCollider } from '@react-three/rapier'

// Default terrain configuration
const DEFAULT_TERRAIN_CONFIG = {
    viewDistance: 160,
    tileSize: 32,
    resolution: 32,
    smoothness: 15,
    maxHeight: 2,
}

// TerrainTile component
const TerrainTile = ({ position, tileSize, resolution, smoothness, maxHeight, noise }) => {
    // Load textures once for all tiles
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

    // Generate geometry for this tile
    const geometry = useMemo(() => {
        const step = tileSize / (resolution - 1)
        const flatAreaRadiusSq = (tileSize * 0.5) ** 2
        const transitionEndDistSq = (tileSize * 2) ** 2
        const uvScale = 1 / (resolution - 1)

        // Determine if this is a center tile (one of the 4 tiles around [0,0])
        const tileX = Math.floor(position[0] / tileSize)
        const tileZ = Math.floor(position[2] / tileSize)
        const isCenterTile = tileX >= -1 && tileX <= 0 && tileZ >= -1 && tileZ <= 0

        // Generate vertices, UVs, and indices
        const vertices = new Float32Array(resolution * resolution * 3)
        const uvs = new Float32Array(resolution * resolution * 2)
        const indices = new Uint32Array((resolution - 1) * (resolution - 1) * 6)

        let vIndex = 0,
            uvIndex = 0,
            iIndex = 0

        // Generate vertices, UVs, and indices
        for (let i = 0; i < resolution; i++) {
            for (let j = 0; j < resolution; j++) {
                // Calculate world position
                const worldX = position[0] + i * step
                const worldZ = position[2] + j * step

                // Calculate distance from world center [0,0]
                const distSq = worldX * worldX + worldZ * worldZ

                let height = 0

                // Calculate height based on distance from center
                if (distSq >= flatAreaRadiusSq) {
                    const rawHeight = noise.perlin2(worldX / smoothness, worldZ / smoothness) * maxHeight

                    if (isCenterTile || distSq < transitionEndDistSq) {
                        const t = (Math.sqrt(distSq) - Math.sqrt(flatAreaRadiusSq)) / (Math.sqrt(transitionEndDistSq) - Math.sqrt(flatAreaRadiusSq))
                        height = rawHeight * (t * t * (3 - 2 * t)) // Smoothstep function
                    } else {
                        height = rawHeight
                    }
                }

                // Add vertex and UV data
                vertices[vIndex++] = i * step
                vertices[vIndex++] = height
                vertices[vIndex++] = j * step

                uvs[uvIndex++] = i * uvScale
                uvs[uvIndex++] = j * uvScale

                // Add triangle indices
                if (i < resolution - 1 && j < resolution - 1) {
                    const index = i * resolution + j
                    indices[iIndex++] = index + resolution
                    indices[iIndex++] = index + 1
                    indices[iIndex++] = index + resolution + 1

                    indices[iIndex++] = index
                    indices[iIndex++] = index + 1
                    indices[iIndex++] = index + resolution
                }
            }
        }

        const geometry = new BufferGeometry()
        geometry.setIndex(new BufferAttribute(indices, 1))
        geometry.setAttribute('position', new BufferAttribute(vertices, 3))
        geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
        geometry.computeVertexNormals()

        return geometry
    }, [position, tileSize, resolution, smoothness, maxHeight, noise])

    return (
        <RigidBody type='fixed' position={position} colliders={false}>
            <mesh name={`TerrainTile-${position[0]}-${position[2]}`}>
                <meshStandardMaterial {...textures} receiveShadow />
                <primitive object={geometry} />
                <TrimeshCollider args={[geometry.attributes.position.array, geometry.index.array]} />
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
