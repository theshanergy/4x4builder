import { useCallback } from 'react'
import { Mesh, Color } from 'three'

const COLORS = {
    WHITE: new Color(1, 1, 1),
    LIGHT_GREY: new Color(0.8, 0.8, 0.8),
    MED_GREY: new Color(0.5, 0.5, 0.5),
    DARK_GREY: new Color(0.2, 0.2, 0.2),
    BLACK: new Color(0.025, 0.025, 0.025),
}

// Set vehicle materials.
const setMaterials = (material, color, roughness, rim_color, rim_color_secondary) => {
    // Switch material name.
    switch (material.name) {
        case 'body':
            material.color.setStyle(color)
            material.metalness = 0.4
            material.roughness = roughness
            break
        case 'chrome':
        case 'mirror':
            material.metalness = 1
            material.roughness = 0
            material.color.set(COLORS.WHITE)
            break
        case 'glass':
            material.transparent = true
            material.metalness = 1
            material.roughness = 0
            material.opacity = 0.2
            material.color.set(COLORS.LIGHT_GREY)
            break
        case 'glass_tint':
            material.transparent = true
            material.metalness = 1
            material.roughness = 0
            material.opacity = 0.4
            material.color.set(COLORS.MED_GREY)
            break
        case 'glass_dark':
            material.transparent = true
            material.metalness = 1
            material.roughness = 0
            material.opacity = 0.8
            material.color.set(COLORS.DARK_GREY)
            break
        case 'rubber':
            material.metalness = 0.5
            material.roughness = 0.9
            material.flatShading = true
            material.color.set(COLORS.BLACK)
            break
        case 'black':
            material.metalness = 0
            material.roughness = 0.5
            material.color.set(COLORS.BLACK)
            break
        case 'rim':
        case 'rim_secondary':
            // Switch rim color / secondary rim color.
            switch (material.name === 'rim_secondary' ? rim_color_secondary : rim_color) {
                case 'silver':
                    material.metalness = 0.6
                    material.roughness = 0.1
                    material.color.set(COLORS.LIGHT_GREY)
                    break
                case 'chrome':
                    material.metalness = 0.8
                    material.roughness = 0
                    material.color.set(COLORS.WHITE)
                    break
                case 'gloss_black':
                    material.metalness = 1
                    material.roughness = 0.1
                    material.color.set(COLORS.BLACK)
                    break
                case 'flat_black':
                    material.metalness = 0.2
                    material.roughness = 1
                    material.color.set(COLORS.BLACK)
                    break
                case 'body':
                    material.metalness = 0.4
                    material.roughness = roughness
                    material.color.setStyle(color)
                    break
                default:
            }
            break
        default:
    }
}

export default function useMaterialProperties() {
    // Set object materials.
    const setObjectMaterials = useCallback((object, color, roughness, rim_color, rim_color_secondary) => {
        if (!object) return

        // Traverse object.
        object.traverseVisible((child) => {
            if (child instanceof Mesh) {
                // Cast shadows from mesh.
                child.castShadow = true

                // Ensure that the material is always an array.
                const materials = Array.isArray(child.material) ? child.material : [child.material]

                // Set material properties for each material.
                materials.forEach((material) => {
                    setMaterials(material, color, roughness, rim_color, rim_color_secondary)
                })
            }
        })
    }, [])

    return { setObjectMaterials }
}
