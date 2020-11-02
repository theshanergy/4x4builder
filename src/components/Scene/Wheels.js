import React, { useEffect } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import vehicleConfigs from 'vehicleConfigs'


function Wheels({ id, rim, tire, wheel_offset, tire_diameter, rim_diameter, rim_width, setObjectColor }) {

    // Load models.
    const rimModel = useGLTF(vehicleConfigs.wheels.rims[rim].model)
    const tireModel = useGLTF(vehicleConfigs.wheels.tires[tire].model)


    // Wheel position.
    let offset = vehicleConfigs.vehicles[id]['wheel_offset'] + parseFloat(wheel_offset)
    let wheelbase = vehicleConfigs.vehicles[id]['wheelbase']

    let rotation = (Math.PI * 90) / 180
    let steering = (Math.PI * -10) / 180
    let height = (tire_diameter * 0.0254) / 2

    // Rim scaling.
    let rim_diameter_metric = (rim_diameter * 2.54) / 100
    let rim_diameter_scale = (rim_diameter_metric + 0.03175) / vehicleConfigs.wheels.rims[rim].od

    let rim_width_metric = (rim_width * 2.54) / 100
    let rim_width_scale = rim_width_metric / vehicleConfigs.wheels.rims[rim].width


    // Run once.
    useEffect(() => {
        // Duplicate tire geometry.
        tireModel.scene.traverse(function (child) {
            if (child instanceof THREE.Mesh) {
                // Cast shadows.
                child.castShadow = true
                // Clone original geometry.
                child.origGeometry = child.geometry.clone()
            }
        })
    }, [tireModel.scene])

    // Scale tires.
    useEffect(() => {

        let tire_width_scale = rim_width_metric / vehicleConfigs.wheels.tires[tire].width

        let tire_od = vehicleConfigs.wheels.tires[tire].od / 2
        let tire_id = vehicleConfigs.wheels.tires[tire].id / 2

        let newOd = (tire_diameter * 2.54) / 10 / 2
        let newId = (rim_diameter * 2.54) / 10 / 2

        // Traverse tire.
        tireModel.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                // Reset geometry.
                child.geometry.copy(child.origGeometry)

                // Scale to match wheel.
                child.geometry.scale(1, 1, tire_width_scale)

                // Loop through vertices.
                for (var i = 0, l = child.geometry.attributes.position.count; i < l; i++) {
                    // Start vector.
                    let startVector = new THREE.Vector3().fromBufferAttribute(child.geometry.getAttribute('position'), i)

                    // Center vector.
                    let centerVector = new THREE.Vector3(0, 0, startVector.z)

                    // Distance from center.
                    let centerDist = centerVector.distanceTo(startVector)

                    // Distance from rim.
                    let rimDist = centerDist - tire_id

                    // Percentage from rim.
                    let percentOut = rimDist / (tire_od - tire_id)

                    // New distance from center.
                    let newRimDist = (percentOut * (newOd - newId) + newId) / 10

                    // End vector.
                    let setVector = linePoint(centerVector, startVector, newRimDist)

                    // Set x,y
                    child.geometry.attributes.position.setX(i, setVector.x)
                    child.geometry.attributes.position.setY(i, setVector.y)
                }

                // Update geometry.
                child.geometry.attributes.position.needsUpdate = true
            }
        })

    }, [tire, tireModel.scene, rim_diameter, rim_width_metric, tire_diameter])


    // Calculate point on line (a to b, at length).
    const linePoint = (a, b, length) => {
        let dir = b.clone().sub(a).normalize().multiplyScalar(length)
        return a.clone().add(dir)
    }

    const Wheel = ({ name, position, rotation }) => {
        return (
            <object3D name={name} position={position} rotation={rotation}>
                <primitive object={rimModel.scene.clone(true)} scale={[rim_diameter_scale, rim_diameter_scale, rim_width_scale]} />
                <primitive object={tireModel.scene.clone(true)} />
            </object3D>
        )
    }


    return (
        <object3D name="Wheels">
            <Wheel name="FL" position={[offset, height, wheelbase / 2]} rotation={[0, rotation + steering, 0]} />
            <Wheel name="FR" position={[-offset, height, wheelbase / 2]} rotation={[0, -rotation + steering, 0]} />
            <Wheel name="RL" position={[offset, height, -wheelbase / 2]} rotation={[0, rotation, 0]} />
            <Wheel name="RR" position={[-offset, height, -wheelbase / 2]} rotation={[0, -rotation, 0]} />
        </object3D>
    )
}

export default Wheels