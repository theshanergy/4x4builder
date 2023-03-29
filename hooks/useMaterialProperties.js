import { Mesh, Color } from 'three'

export default function useMaterialProperties(vehicle) {
    // Set object color.
    const setObjectColor = (object) => {
        if (!object) return
        // Traverse object.
        object.traverseVisible((child) => {
            if (child instanceof Mesh) {
                // Cast shadows from mesh.
                child.castShadow = true

                // Multiple materials.
                if (Array.isArray(child.material)) {
                    child.material.forEach((material) => setMaterials(material))
                }
                // Single material.
                else {
                    setMaterials(child.material)
                }
            }
        })
    }

    // Update materials.
    const setMaterials = (material) => {
        // Switch materials.
        switch (material.name) {
            // Body paint.
            case 'body':
                material.color.setStyle(vehicle.color)
                material.metalness = 0.4
                material.roughness = vehicle.roughness
                break
            case 'chrome':
            case 'mirror':
                material.metalness = 1
                material.roughness = 0
                material.color.set(new Color(1, 1, 1))
                break
            case 'glass':
                material.transparent = true
                material.metalness = 1
                material.roughness = 0
                material.opacity = 0.2
                material.color.set(new Color(0.8, 0.8, 0.8))
                break
            case 'glass_tint':
                material.transparent = true
                material.metalness = 1
                material.roughness = 0
                material.opacity = 0.4
                material.color.set(new Color(0.6, 0.6, 0.6))
                break
            case 'glass_dark':
                material.transparent = true
                material.metalness = 1
                material.roughness = 0
                material.opacity = 0.8
                material.color.set(new Color(0.2, 0.2, 0.2))
                break
            case 'rim':
                setRimColor(material)
                break
            case 'rim_secondary':
                setRimColor(material, 'secondary')
                break
            case 'rubber':
                material.metalness = 0.5
                material.roughness = 0.9
                material.flatShading = true
                material.color.set(new Color(0.025, 0.025, 0.025))
                break
            case 'black':
                material.metalness = 0
                material.roughness = 0.5
                material.color.set(new Color(0.025, 0.025, 0.025))
                break
            default:
        }
    }

    const setRimColor = (material, type = 'primary') => {
        let color = type === 'secondary' ? vehicle.rim_color_secondary : vehicle.rim_color

        switch (color) {
            case 'silver':
                material.metalness = 0.6
                material.roughness = 0.1
                material.color.set(new Color(0.8, 0.8, 0.8))
                break
            case 'chrome':
                material.metalness = 0.8
                material.roughness = 0
                material.color.set(new Color(1, 1, 1))
                break
            case 'gloss_black':
                material.metalness = 1
                material.roughness = 0.1
                material.color.set(new Color(0.035, 0.035, 0.035))
                break
            case 'flat_black':
                material.metalness = 0.2
                material.roughness = 1
                material.color.set(new Color(0.005, 0.005, 0.005))
                break
            case 'body':
                material.metalness = 0.4
                material.roughness = vehicle.roughness
                material.color.setStyle(vehicle.color)
                break
            default:
        }
    }

    return { setObjectColor }
}
