import { useMemo } from 'react'
import { Matrix4 } from 'three'
import { useGLTF } from '@react-three/drei'

import useGameStore from '../store/gameStore'
import { getBiome } from '../config/biomes'

/**
 * useVegetationModels Hook
 *
 * Loads and caches vegetation models at different LOD levels based on biome vegetation config.
 * Each unique model is loaded only once and shared across all vegetation types that use it.
 * Returns an array of vegetation type objects, each containing:
 * - name: The vegetation type name
 * - config: The original vegetation config
 * - lods: Object with LOD levels 0-3, each containing an array of mesh data
 *   (geometry and material pairs) that can be used for instanced rendering.
 *
 * @returns {Array|null} Array of vegetation type models, or null if not loaded
 */
export const useVegetationModels = () => {
	const currentBiome = useGameStore((state) => state.currentBiome)

	// Get biome-specific vegetation config
	const biomeConfig = useMemo(() => getBiome(currentBiome), [currentBiome])
	const VEGETATION_TYPES = biomeConfig.vegetation

	// Extract unique models
	const UNIQUE_MODELS = useMemo(() => {
		const models = new Set()
		VEGETATION_TYPES.forEach((type) => models.add(type.model))
		return Array.from(models)
	}, [VEGETATION_TYPES])

	// Load all unique models using multiple hook calls (required by React hooks rules)
	// useGLTF returns cached results after preload, so this is efficient
	const gltfResults = UNIQUE_MODELS.map((modelPath) => useGLTF(modelPath))

	// Memoize the array itself to prevent re-renders
	const gltfs = useMemo(() => gltfResults, [gltfResults.map((g) => g.scene).join(',')])

	return useMemo(() => {
		// Check if all models are loaded
		if (gltfs.some((gltf) => !gltf || !gltf.scene)) return null

		// Create a map of model path to GLTF for quick lookup
		const modelMap = new Map()
		UNIQUE_MODELS.forEach((modelPath, index) => {
			modelMap.set(modelPath, gltfs[index])
		})

		// Process each vegetation type
		const vegetationModels = VEGETATION_TYPES.map((type) => {
			const gltf = modelMap.get(type.model)
			if (!gltf) {
				console.warn(`[useVegetationModels] Could not load model for ${type.name}`)
				return null
			}

			const lods = {}
			const lodLevels = ['lod0', 'lod1', 'lod2', 'lod3']

			// Track the last valid LOD for fallback
			let lastValidMeshName = null

			// Load each LOD level
			lodLevels.forEach((lodKey, lodIndex) => {
				const meshName = type.meshes?.[lodKey]

				// Use provided mesh name or fall back to last valid LOD
				const actualMeshName = meshName || lastValidMeshName

				if (!actualMeshName) {
					return // No valid mesh for this LOD
				}

				const vegetation = gltf.scene.getObjectByName(actualMeshName)

				if (!vegetation) {
					console.warn(`[useVegetationModels] Could not find ${actualMeshName} in model for ${type.name}`)
					return
				}

				// Collect all meshes from this LOD
				const meshes = []
				vegetation.traverse((child) => {
					if (child.isMesh) {
						// If a specific mesh name is configured, filter by it
						if (type.mesh && child.name !== type.mesh) {
							return
						}

						// Clone geometry to avoid modifying the original
						const geometry = child.geometry.clone()

						// Check if spherical normals are enabled for this LOD
						const useSphericalNormals = type.sphericalNormals?.[lodKey]

						if (useSphericalNormals) {
							// Compute spherical-ish normals from billboard UV
							const uvs = geometry.attributes.uv
							const normals = geometry.attributes.normal

							if (normals && uvs) {
								for (let i = 0; i < normals.count; i++) {
									// Get UV coordinates (0-1 range)
									const u = uvs.getX(i)
									const v = uvs.getY(i)

									// Map UV to spherical coordinates
									// Center UVs around 0 and scale to create sphere-like curvature
									const centerU = (u - 0.5) * 2 // -1 to 1
									const centerV = (v - 0.5) * 2 // -1 to 1

									// Create spherical normal
									// X and Z are based on horizontal position, Y points upward
									const nx = centerU * 0.5 // Subtle horizontal curvature
									const ny = 0.8 + centerV * 0.2 // Mostly upward with slight vertical variation
									const nz = 0.1 // Slight forward bias

									// Normalize the vector
									const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
									normals.setXYZ(i, nx / length, ny / length, nz / length)
								}
								normals.needsUpdate = true
							}
						}

						// Bake the mesh's local transform into a matrix
						// This captures the mesh's position, rotation, and scale relative to its parent
						const meshTransform = new Matrix4()
						meshTransform.compose(child.position, child.quaternion, child.scale)

						meshes.push({
							geometry: geometry,
							material: child.material,
							transform: meshTransform,
						})
					}
				})

				if (meshes.length > 0) {
					lods[lodIndex] = meshes
					// Update last valid mesh for fallback
					if (meshName) {
						lastValidMeshName = meshName
					}
				}
			})

			return {
				name: type.name,
				config: type,
				lods,
			}
		}).filter(Boolean)

		return vegetationModels
	}, [gltfs])
}
