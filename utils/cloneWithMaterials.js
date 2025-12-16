// Deep clone a scene with unique materials to avoid shared material references
// Uses a material cache to ensure materials are only cloned once per scene clone
const cloneWithMaterials = (scene) => {
	const clone = scene.clone()
	// Cache to map original materials to their clones
	const materialCache = new Map()

	const cloneMaterial = (material) => {
		if (!materialCache.has(material)) {
			materialCache.set(material, material.clone())
		}
		return materialCache.get(material)
	}

	clone.traverse((child) => {
		if (child.isMesh) {
			if (Array.isArray(child.material)) {
				child.material = child.material.map((m) => cloneMaterial(m))
			} else if (child.material) {
				child.material = cloneMaterial(child.material)
			}
		}
	})
	return clone
}

export default cloneWithMaterials
