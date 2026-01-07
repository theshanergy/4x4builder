import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'

/**
 * useVegetationModels Hook
 * 
 * Loads and caches vegetation models at different LOD levels from a GLTF file.
 * Returns an object with LOD levels 0-3, each containing an array of mesh data
 * (geometry and material pairs) that can be used for instanced rendering.
 * 
 * @returns {Object|null} Vegetation models indexed by LOD level (0-3), or null if not loaded
 */
export const useVegetationModels = () => {
	const gltf = useGLTF('/assets/models/environment/pine_trees.glb')

	return useMemo(() => {
		if (!gltf) return null

		const models = {}

		// Load each LOD level
		const lodMeshNames = ['SM_Pine01', 'SM_Pine01_lod1', 'SM_Pine01_lod2', 'SM_Pine01_lod3']
		
		lodMeshNames.forEach((meshName, lod) => {
			const vegetation = gltf.scene.getObjectByName(meshName)

			if (!vegetation) {
				console.warn(`[useVegetationModels] Could not find ${meshName} in model`)
				return
			}

			// Collect all meshes from this LOD
			const meshes = []
			vegetation.traverse((child) => {
				if (child.isMesh) {
					meshes.push({
						geometry: child.geometry,
						material: child.material,
					})
				}
			})

			if (meshes.length > 0) {
				models[lod] = meshes
			}
		})

		console.log('[useVegetationModels] Loaded LOD models:', Object.keys(models).join(', '))
		return models
	}, [gltf])
}
