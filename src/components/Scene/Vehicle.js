import React, { useRef, Suspense } from 'react'
import { useGLTF } from '@react-three/drei'
import vehicleConfigs from 'vehicleConfigs'
import Wheels from './Wheels'

function Vehicle({ vehicle }) {

    // Get refs.
    const vehicleContainer = useRef()

    // Get vehicle height
    let axle_height = (vehicle.tire_diameter * 2.54) / 100 / 2
    let lift_height = typeof vehicle.lift !== 'undefined' ? (vehicle.lift * 2.54) / 100 : 0 // adding lift height converted to meters.
    let vehicleHeight = axle_height + lift_height

    // Vehicle.
    const Vehicle = (id) => {
        // Load vehicle model.
        const vehicleModel = useGLTF(vehicleConfigs.vehicles[vehicle.id].model)

        return (
            <primitive object={vehicleModel.scene} position={[0, vehicleHeight, 0]} />
        )
    }

    // Load vehicle addon.
    const Addons = () => {

        // Loop through addons.
        for (const addon of Object.keys(vehicle.addons)) {
            // Get new addon selection.
            // let addon_selection = vehicle.addons[addon_name]

            // let addon_model = useGLTF(vehicleConfigs.vehicles[vehicle.id]['addons'][addon_name]['options'][addon_selection]['model'])
        }

        return (
            <object3D name="Addons"></object3D>
        )
    }

    // // Set object color.
    // const setObjectColor = (object) => {
    //     // Traverse object.
    //     object.traverse((child) => {
    //         if (child instanceof THREE.Mesh) {
    //             // Cast shadows from mesh.
    //             child.castShadow = true

    //             // Multiple materials.
    //             if (Array.isArray(child.material)) {
    //                 child.material.forEach((material) => setMaterials(material))
    //             }
    //             // Single material.
    //             else {
    //                 setMaterials(child.material)
    //             }
    //         }
    //     })
    // }

    // // Update materials.
    // const setMaterials = (material) => {
    //     // Switch materials.
    //     switch (material.name) {
    //         // Body paint.
    //         case 'body':
    //             material.envMap = envMap
    //             material.color.setStyle(vehicle.color)
    //             material.metalness = 0.4
    //             material.roughness = vehicle.roughness
    //             break
    //         case 'chrome':
    //         case 'mirror':
    //             material.envMap = envMap
    //             material.metalness = 1
    //             material.roughness = 0
    //             material.color.set(new THREE.Color(1, 1, 1))
    //             break
    //         case 'glass':
    //             material.envMap = envMap
    //             material.transparent = true
    //             material.metalness = 1
    //             material.roughness = 0
    //             material.opacity = 0.2
    //             material.color.set(new THREE.Color(0.8, 0.8, 0.8))
    //             break
    //         case 'glass_tint':
    //             material.envMap = envMap
    //             material.transparent = true
    //             material.metalness = 1
    //             material.roughness = 0
    //             material.opacity = 0.4
    //             material.color.set(new THREE.Color(0.6, 0.6, 0.6))
    //             break
    //         case 'glass_dark':
    //             material.envMap = envMap
    //             material.transparent = true
    //             material.metalness = 1
    //             material.roughness = 0
    //             material.opacity = 0.8
    //             material.color.set(new THREE.Color(0.2, 0.2, 0.2))
    //             break
    //         case 'rim':
    //             setRimColor(material)
    //             break
    //         case 'rim_secondary':
    //             setRimColor(material, 'secondary')
    //             break
    //         case 'rubber':
    //             material.metalness = 0.6
    //             material.roughness = 0.8
    //             material.flatShading = true
    //             material.color.set(new THREE.Color(0.2, 0.2, 0.2))
    //             break
    //         case 'black':
    //             material.metalness = 0
    //             material.roughness = 0.5
    //             material.color.set(new THREE.Color(0.1, 0.1, 0.1))
    //             break
    //         default:
    //     }
    // }

    // const setRimColor = (material, type = 'primary') => {
    //     let silver = new THREE.Color(0.8, 0.8, 0.8)
    //     let white = new THREE.Color(1, 1, 1)
    //     let black = new THREE.Color(0.1, 0.1, 0.1)

    //     material.envMap = envMap

    //     let color = type === 'secondary' ? vehicle.rim_color_secondary : vehicle.rim_color

    //     switch (color) {
    //         case 'silver':
    //             material.metalness = 0.6
    //             material.roughness = 0.2
    //             material.color.set(silver)
    //             break
    //         case 'chrome':
    //             material.metalness = 0.8
    //             material.roughness = 0
    //             material.color.set(white)
    //             break
    //         case 'gloss_black':
    //             material.metalness = 0.4
    //             material.roughness = 0
    //             material.color.set(black)
    //             break
    //         case 'flat_black':
    //             material.metalness = 0.2
    //             material.roughness = 1
    //             material.color.set(black)
    //             break
    //         case 'body':
    //             material.metalness = 0.4
    //             material.roughness = vehicle.roughness
    //             material.color.setStyle(vehicle.color)
    //             break
    //         default:
    //     }
    // }


    // todo: when vehicle prop changes, set height, animate drop, update colors, set wheel position.

    return (
        <object3D name="Vehicle">
            <Suspense fallback={null}>
                <Vehicle id={vehicle.id} />
            </Suspense>

            <Suspense fallback={null}>
                <Wheels {...vehicle} />
            </Suspense>

            <Suspense fallback={null}>
                <Addons />
            </Suspense>

        </object3D>
    )
}

export default Vehicle