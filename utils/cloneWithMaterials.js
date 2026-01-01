// Deep clone a scene with unique materials to avoid shared material references
// Returns { scene, materials } where materials is a Map of material name -> material
// This allows direct material updates without traversing the scene tree
const cloneWithMaterials = (scene) => {
	const clone = scene.clone()
	// Cache to map original materials to their clones
	const materialCache = new Map()
	// Map of material name -> cloned material for direct access
	const materialsByName = new Map()

	const cloneMaterial = (material) => {
		if (!materialCache.has(material)) {
			const cloned = material.clone()
			materialCache.set(material, cloned)
			// Store by name for direct access (if name exists)
			if (cloned.name) {
				materialsByName.set(cloned.name, cloned)
			}
		}
		return materialCache.get(material)
	}

	clone.traverse((child) => {
		if (child.isMesh) {
			// Enable shadows
			child.castShadow = true
			child.receiveShadow = true

			if (Array.isArray(child.material)) {
				child.material = child.material.map((m) => cloneMaterial(m))
			} else if (child.material) {
				child.material = cloneMaterial(child.material)
			}
		}
	})

	return { scene: clone, materials: materialsByName }
}

export default cloneWithMaterials
