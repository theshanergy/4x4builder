import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { VEGETATION_TYPES } from '../config/vegetation'

/**
 * useVegetationModels Hook
 * 
 * Loads and caches vegetation models at different LOD levels based on VEGETATION_TYPES config.
 * Returns an array of vegetation type objects, each containing:
 * - name: The vegetation type name
 * - lods: Object with LOD levels 0-3, each containing an array of mesh data
 *   (geometry and material pairs) that can be used for instanced rendering.
 * 
 * @returns {Array|null} Array of vegetation type models, or null if not loaded
 */
export const useVegetationModels = () => {
	// Load all unique models referenced in config
	const uniqueModels = useMemo(() => {
		const models = new Set()
		VEGETATION_TYPES.forEach(type => models.add(type.model))
		return Array.from(models)
	}, [])

	// Load all GLTFs
	const gltfs = uniqueModels.map(modelPath => {
		// eslint-disable-next-line react-hooks/rules-of-hooks
		return useGLTF(modelPath)
	})

	return useMemo(() => {
		if (!gltfs || gltfs.some(gltf => !gltf)) return null

		// Create a map of model path to GLTF
		const modelMap = {}
		uniqueModels.forEach((modelPath, index) => {
			modelMap[modelPath] = gltfs[index]
		})

		// Process each vegetation type
		const vegetationModels = VEGETATION_TYPES.map(type => {
			const gltf = modelMap[type.model]
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

		console.log('[useVegetationModels] Loaded vegetation types:', vegetationModels.map(v => v.name).join(', '))
		return vegetationModels
	}, [gltfs, uniqueModels])
}
