import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { VEGETATION_TYPES } from '../config/vegetation'

// Extract unique models at module level (runs once)
const UNIQUE_MODELS = (() => {
	const models = new Set()
	VEGETATION_TYPES.forEach((type) => models.add(type.model))
	return Array.from(models)
})()

// Preload all models immediately to ensure they're cached
UNIQUE_MODELS.forEach((modelPath) => {
	useGLTF.preload(modelPath)
})

/**
 * useVegetationModels Hook
 *
 * Loads and caches vegetation models at different LOD levels based on VEGETATION_TYPES config.
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

			// Load each LOD level
			type.meshNames.forEach((meshName, lodIndex) => {
				const vegetation = gltf.scene.getObjectByName(meshName)

				if (!vegetation) {
					console.warn(`[useVegetationModels] Could not find ${meshName} in model for ${type.name}`)
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
						meshes.push({
							geometry: child.geometry,
							material: child.material,
						})
					}
				})

				if (meshes.length > 0) {
					lods[lodIndex] = meshes
				}
			})

			return {
				name: type.name,
				config: type,
				lods,
			}
		}).filter(Boolean)

		if (vegetationModels.length > 0) {
			console.log('[useVegetationModels] Loaded vegetation types:', vegetationModels.map((v) => v.name).join(', '))
		}
		return vegetationModels
	}, [gltfs])
}
