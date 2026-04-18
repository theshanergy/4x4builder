import { useRef, useMemo, useEffect, memo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'
import { RepeatWrapping, PlaneGeometry, Vector3 } from 'three'

// Fade-in duration for new tiles (in seconds)
const TILE_FADE_DURATION = 0.5

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

export default TerrainTile
