import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'

/**
 * useTreeModels Hook
 * 
 * Loads and caches tree models at different LOD levels from a GLTF file.
 * Returns an object with LOD levels 0-3, each containing an array of mesh data
 * (geometry and material pairs) that can be used for instanced rendering.
 * 
 * @returns {Object|null} Tree models indexed by LOD level (0-3), or null if not loaded
 */
export const useTreeModels = () => {
	const gltf = useGLTF('/assets/models/environment/pine_trees.glb')

	return useMemo(() => {
		if (!gltf) return null

		const models = {}

		// Load each LOD level
		const lodMeshNames = ['SM_Pine01', 'SM_Pine01_lod1', 'SM_Pine01_lod2', 'SM_Pine01_lod3']
		
		lodMeshNames.forEach((meshName, lod) => {
			const tree = gltf.scene.getObjectByName(meshName)

			if (!tree) {
				console.warn(`[useTreeModels] Could not find ${meshName} in model`)
				return
			}

			// Collect all meshes from this LOD
			const meshes = []
			tree.traverse((child) => {
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

		console.log('[useTreeModels] Loaded LOD models:', Object.keys(models).join(', '))
		return models
	}, [gltf])
}
