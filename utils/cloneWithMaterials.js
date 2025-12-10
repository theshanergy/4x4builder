// Deep clone a scene with unique materials to avoid shared material references
const cloneWithMaterials = (scene) => {
	const clone = scene.clone()
	clone.traverse((child) => {
		if (child.isMesh) {
			if (Array.isArray(child.material)) {
				child.material = child.material.map((m) => m.clone())
			} else if (child.material) {
				child.material = child.material.clone()
			}
		}
	})
	return clone
}

export default cloneWithMaterials
