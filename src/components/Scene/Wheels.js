import React, { useEffect } from 'react'
import { Mesh, Vector3 } from 'three'
import { useGLTF } from '@react-three/drei'
import vehicleConfigs from 'vehicleConfigs'


function Wheels({ vehicle }) {

    // Load models.
    const rimModel = useGLTF(vehicleConfigs.wheels.rims[vehicle.rim].model)
    const tireModel = useGLTF(vehicleConfigs.wheels.tires[vehicle.tire].model)


    // Wheel position.
    let offset = vehicleConfigs.vehicles[vehicle.id]['wheel_offset'] + parseFloat(vehicle.wheel_offset)
    let wheelbase = vehicleConfigs.vehicles[vehicle.id]['wheelbase']

    let rotation = (Math.PI * 90) / 180
    let steering = (Math.PI * -10) / 180
    let height = (vehicle.tire_diameter * 2.54) / 100 / 2

    // Rim scaling.
    let rim_diameter = (vehicle.rim_diameter * 2.54) / 100
    let rim_diameter_scale = (rim_diameter + 0.03175) / vehicleConfigs.wheels.rims[vehicle.rim].od

    let rim_width = (vehicle.rim_width * 2.54) / 100
    let rim_width_scale = rim_width / vehicleConfigs.wheels.rims[vehicle.rim].width



    // Run once.
    useEffect(() => {
        // Duplicate tire geometry.
        tireModel.scene.traverse(function (child) {
            if (child instanceof Mesh) {
                // Cast shadows.
                child.castShadow = true
                // Clone original geometry.
                child.origGeometry = child.geometry.clone()
            }
        })
    }, [tireModel.scene])


    // Scale tires.
    useEffect(() => {

        let tire_width_scale = rim_width / vehicleConfigs.wheels.tires[vehicle.tire].width

        let tire_od = vehicleConfigs.wheels.tires[vehicle.tire].od / 2
        let tire_id = vehicleConfigs.wheels.tires[vehicle.tire].id / 2
    
        let newOd = (vehicle.tire_diameter * 2.54) / 10 / 2
        let newId = (vehicle.rim_diameter * 2.54) / 10 / 2

        // Traverse tire.
        tireModel.scene.traverse((child) => {
            if (child instanceof Mesh) {
                // Reset geometry.
                child.geometry.copy(child.origGeometry)

                // Scale to match wheel.
                child.geometry.scale(1, 1, tire_width_scale)

                // Loop through vertices.
                for (var i = 0, l = child.geometry.attributes.position.count; i < l; i++) {
                    // Start vector.
                    let startVector = new Vector3().fromBufferAttribute(child.geometry.getAttribute('position'), i)

                    // Center vector.
                    let centerVector = new Vector3(0, 0, startVector.z)

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

    }, [vehicle])


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