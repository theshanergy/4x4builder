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

// Terrain blend shader for road/sand integration
const TerrainBlendShader = {
	uniforms: {
		sandMap: { value: null },
		sandNormalMap: { value: null },
		opacity: { value: 1.0 },
	},
	vertexShader: /* glsl */ `
		attribute float roadBlend;
		attribute float signedRoadDist;
		varying vec2 vUv;
		varying float vRoadBlend;
		varying float vSignedRoadDist;
		varying vec3 vNormal;
		varying vec3 vViewPosition;
		varying vec3 vWorldPosition;
		varying vec3 vTangent;
		varying vec3 vBitangent;
		
		void main() {
			vUv = uv;
			vRoadBlend = roadBlend;
			vSignedRoadDist = signedRoadDist;
			vNormal = normalize(normalMatrix * normal);
			
			// Compute tangent and bitangent for normal mapping
			vec3 worldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
			vec3 tangent = normalize(cross(worldNormal, vec3(0.0, 0.0, 1.0)));
			if (length(tangent) < 0.01) {
				tangent = normalize(cross(worldNormal, vec3(1.0, 0.0, 0.0)));
			}
			vec3 bitangent = normalize(cross(worldNormal, tangent));
			
			vTangent = normalize(normalMatrix * tangent);
			vBitangent = normalize(normalMatrix * bitangent);
			
			vec4 worldPosition = modelMatrix * vec4(position, 1.0);
			vWorldPosition = worldPosition.xyz;
			
			vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
			vViewPosition = -mvPosition.xyz;
			
			gl_Position = projectionMatrix * mvPosition;
		}
	`,
	fragmentShader: /* glsl */ `
		uniform sampler2D sandMap;
		uniform sampler2D sandNormalMap;
		uniform float opacity;
		
		varying vec2 vUv;
		varying float vRoadBlend;
		varying float vSignedRoadDist;
		varying vec3 vNormal;
		varying vec3 vViewPosition;
		varying vec3 vWorldPosition;
		varying vec3 vTangent;
		varying vec3 vBitangent;
		
		// Simple hash for procedural noise
		float hash(vec2 p) {
			return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
		}
		
		// Value noise for asphalt texture
		float noise(vec2 p) {
			vec2 i = floor(p);
			vec2 f = fract(p);
			f = f * f * (3.0 - 2.0 * f);
			
			float a = hash(i);
			float b = hash(i + vec2(1.0, 0.0));
			float c = hash(i + vec2(0.0, 1.0));
			float d = hash(i + vec2(1.0, 1.0));
			
			return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
		}
		
		void main() {
			// Sample sand texture - use world position for seamless tiling
			vec2 sandUv = vUv;
			vec4 sandColor = texture2D(sandMap, sandUv);
			
			// Sample and apply normal map for sand (at larger scale like original)
			vec2 normalUv = vUv * 0.33;
			vec3 normalMapSample = texture2D(sandNormalMap, normalUv).rgb * 2.0 - 1.0;
			
			// Transform normal from tangent space to view space
			mat3 TBN = mat3(vTangent, vBitangent, vNormal);
			vec3 sandNormal = normalize(TBN * normalMapSample);
			
			// Procedural asphalt color with noise variation
			float asphaltNoise = noise(vWorldPosition.xz * 2.0) * 0.08 + noise(vWorldPosition.xz * 8.0) * 0.04;
			vec3 asphaltBase = vec3(0.15, 0.15, 0.16);
			vec3 asphaltColor = asphaltBase + vec3(asphaltNoise - 0.06);
			
			// Add some larger aggregate variation
			float aggregate = noise(vWorldPosition.xz * 0.5) * 0.03;
			asphaltColor += vec3(aggregate);
			
			// Lane markings
			float lineWidth = 0.15;
			float edgeLineOffset = 5.8;
			
			// Yellow center line (dashed)
			float centerLineDist = abs(vSignedRoadDist);
			float dashPattern = step(0.25, fract(vWorldPosition.z * 0.083));
			float centerLine = (1.0 - smoothstep(lineWidth * 0.5, lineWidth, centerLineDist)) * dashPattern;
			
			// White edge lines (solid)
			float leftEdgeDist = abs(vSignedRoadDist + edgeLineOffset);
			float rightEdgeDist = abs(vSignedRoadDist - edgeLineOffset);
			float leftEdgeLine = 1.0 - smoothstep(lineWidth * 0.5, lineWidth, leftEdgeDist);
			float rightEdgeLine = 1.0 - smoothstep(lineWidth * 0.5, lineWidth, rightEdgeDist);
			
			// Combine lane markings
			vec3 yellowLine = vec3(0.95, 0.75, 0.1);
			vec3 whiteLine = vec3(0.95, 0.95, 0.95);
			
			vec3 roadWithLines = asphaltColor;
			roadWithLines = mix(roadWithLines, yellowLine, centerLine * 0.95);
			roadWithLines = mix(roadWithLines, whiteLine, leftEdgeLine * 0.95);
			roadWithLines = mix(roadWithLines, whiteLine, rightEdgeLine * 0.95);
			
			// Sharp road texture edge at road boundary (7m half-width)
			// This controls the VISUAL texture, separate from height blending
			float roadHalfWidth = 7.0;
			float blendEdge = 0.2;
			float roadFactor = 1.0 - smoothstep(roadHalfWidth - blendEdge, roadHalfWidth + blendEdge, abs(vSignedRoadDist));
			
			// Use sharp roadFactor for texture, vRoadBlend still used for height
			vec3 baseColor = mix(sandColor.rgb, roadWithLines, roadFactor);
			
			// Blend normals - use sand normal for terrain, flat normal for road
			vec3 finalNormal = mix(sandNormal, vNormal, roadFactor);
			
			// Better lighting to match meshStandardMaterial
			vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
			float NdotL = max(dot(finalNormal, lightDir), 0.0);
			
			// Ambient light
			vec3 ambientColor = baseColor * 0.5;
			
			// Diffuse light
			vec3 diffuseColor = baseColor * NdotL * 0.7;
			
			// Simple specular for road (wet look)
			vec3 viewDir = normalize(vViewPosition);
			vec3 halfDir = normalize(lightDir + viewDir);
			float spec = pow(max(dot(finalNormal, halfDir), 0.0), 32.0);
			vec3 specularColor = vec3(0.3) * spec * roadFactor * 0.3;
			
			vec3 finalColor = ambientColor + diffuseColor + specularColor;
			
			gl_FragColor = vec4(finalColor, opacity);
		}
	`,
}

// TerrainTile component
const TerrainTile = memo(({ position, tileSize, resolution, smoothness, maxHeight, noise, map, normalMap, shouldFade = true }) => {
	const materialRef = useRef()
	const opacityRef = useRef(shouldFade ? 0 : 1)

	// Animate opacity from 0 to 1 when tile is created
	useFrame((_, delta) => {
		if (materialRef.current && opacityRef.current < 1) {
			opacityRef.current = Math.min(1, opacityRef.current + delta / TILE_FADE_DURATION)
			materialRef.current.uniforms.opacity.value = opacityRef.current
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

	// Helper to compute base terrain height at any world position (without road)
	const getBaseTerrainHeight = (worldX, worldZ, flatAreaRadiusSq, transitionEndDistSq, isCenterTile) => {
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

	// Helper to compute final height at any world position (with road blending)
	const getHeightAtPosition = (worldX, worldZ, flatAreaRadiusSq, transitionEndDistSq, isCenterTile) => {
		const baseHeight = getBaseTerrainHeight(worldX, worldZ, flatAreaRadiusSq, transitionEndDistSq, isCenterTile)
		const roadInfo = getRoadInfo(worldX, worldZ)

		if (roadInfo.blendFactor > 0) {
			// Blend between terrain height and road height
			const terrainY = baseHeight * maxHeight
			const blendedY = terrainY * (1 - roadInfo.blendFactor) + roadInfo.roadHeight * roadInfo.blendFactor
			return blendedY / maxHeight // Return normalized height
		}

		return baseHeight
	}

	// Generate heights, UVs, normals, and road attributes together
	const terrainData = useMemo(() => {
		const values = []
		const vertexCount = (resolution + 1) * (resolution + 1)
		const positions = new Float32Array(vertexCount * 3)
		const uvs = new Float32Array(vertexCount * 2)
		const normals = new Float32Array(vertexCount * 3)
		const roadBlend = new Float32Array(vertexCount)
		const signedRoadDist = new Float32Array(vertexCount)
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

				// Get road info for this vertex
				const roadInfo = getRoadInfo(worldX, worldZ)
				roadBlend[vertIndex] = roadInfo.blendFactor
				signedRoadDist[vertIndex] = roadInfo.signedDistance

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

		return { values, positions, uvs, normals, roadBlend, signedRoadDist }
	}, [position, tileSize, resolution, smoothness, noise, maxHeight])

	// Create geometry for terrain mesh with road attributes
	const geometry = useMemo(() => {
		const geom = new PlaneGeometry(tileSize, tileSize, resolution, resolution)
		geom.getAttribute('position').array.set(terrainData.positions)

		// Apply pre-computed UVs (world-space coordinates for seamless tiling)
		geom.getAttribute('uv').array.set(terrainData.uvs)
		geom.getAttribute('uv').needsUpdate = true

		// Apply pre-computed normals (calculated analytically from noise gradient)
		geom.getAttribute('normal').array.set(terrainData.normals)
		geom.getAttribute('normal').needsUpdate = true

		// Add custom attributes for road blending
		geom.setAttribute('roadBlend', new BufferAttribute(terrainData.roadBlend, 1))
		geom.setAttribute('signedRoadDist', new BufferAttribute(terrainData.signedRoadDist, 1))

		return geom
	}, [terrainData, tileSize, resolution])

	// Create shader material for terrain/road blending
	const material = useMemo(() => {
		return new ShaderMaterial({
			vertexShader: TerrainBlendShader.vertexShader,
			fragmentShader: TerrainBlendShader.fragmentShader,
			uniforms: {
				sandMap: { value: map },
				sandNormalMap: { value: normalMap },
				opacity: { value: opacityRef.current },
			},
			transparent: opacityRef.current < 1,
		})
	}, [map, normalMap])

	// Keep material ref updated
	useEffect(() => {
		materialRef.current = material
	}, [material])

	// Dispose geometry and material when component unmounts or they change
	useEffect(() => {
		return () => {
			geometry.dispose()
			material.dispose()
		}
	}, [geometry, material])

	// Set collider arguments
	const colliderArgs = useMemo(() => {
		return [resolution, resolution, terrainData.values, { x: tileSize, y: maxHeight, z: tileSize }]
	}, [resolution, terrainData, tileSize, maxHeight])

	return (
		<RigidBody type='fixed' position={position} colliders={false}>
			<HeightfieldCollider args={colliderArgs} name={`Tile-${position[0]}-${position[2]}`} />
			<mesh geometry={geometry} material={material} receiveShadow />
		</RigidBody>
	)
})

// Main TerrainManager component
const TerrainManager = () => {
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

	// Flat area and transition parameters (same as used in TerrainTile)
	const flatAreaRadius = tileSize * 0.5
	const transitionEndDist = tileSize * 2

	// Scratch vector for normal calculations (reused to avoid allocations)
	const normalScratch = useMemo(() => new Vector3(), [])

	// Get raw height value at any world position (normalized 0-1, without road)
	const getRawHeight = useCallback(
		(worldX, worldZ) => {
			const distSq = worldX * worldX + worldZ * worldZ
			const flatAreaRadiusSq = flatAreaRadius * flatAreaRadius
			const transitionEndDistSq = transitionEndDist * transitionEndDist

			if (distSq < flatAreaRadiusSq) return 0

			const noiseValue = noise.perlin2(worldX / smoothness, worldZ / smoothness)
			const normalizedHeight = (noiseValue + 1) / 2

			if (distSq < transitionEndDistSq) {
				const t = (Math.sqrt(distSq) - flatAreaRadius) / (transitionEndDist - flatAreaRadius)
				return normalizedHeight * (t * t * (3 - 2 * t))
			}
			return normalizedHeight
		},
		[noise, smoothness, flatAreaRadius, transitionEndDist]
	)

	// Get terrain height at any world position (in world units, with road blending)
	const getTerrainHeight = useCallback(
		(worldX, worldZ) => {
			const baseHeight = getRawHeight(worldX, worldZ) * maxHeight
			const roadInfo = getRoadInfo(worldX, worldZ)

			if (roadInfo.blendFactor > 0) {
				// Blend between terrain height and road height
				return baseHeight * (1 - roadInfo.blendFactor) + roadInfo.roadHeight * roadInfo.blendFactor
			}

			return baseHeight
		},
		[getRawHeight, maxHeight]
	)

	// Get terrain normal at any world position (optionally pass target vector to avoid allocation)
	const getTerrainNormal = useCallback(
		(worldX, worldZ, target = normalScratch) => {
			const hL = getRawHeight(worldX - GRADIENT_EPSILON, worldZ) * maxHeight
			const hR = getRawHeight(worldX + GRADIENT_EPSILON, worldZ) * maxHeight
			const hD = getRawHeight(worldX, worldZ - GRADIENT_EPSILON) * maxHeight
			const hU = getRawHeight(worldX, worldZ + GRADIENT_EPSILON) * maxHeight

			const dhdx = (hR - hL) / (2 * GRADIENT_EPSILON)
			const dhdz = (hU - hD) / (2 * GRADIENT_EPSILON)

			return target.set(-dhdx, 1, -dhdz).normalize()
		},
		[getRawHeight, maxHeight, normalScratch]
	)

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
