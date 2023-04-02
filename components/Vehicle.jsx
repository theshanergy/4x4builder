import React, { memo, useMemo, useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { Vector3 } from 'three'
import useAnimateHeight from '../hooks/useAnimateHeight'
import vehicleConfigs from '../vehicleConfigs'
import useMaterialProperties from '../hooks/useMaterialProperties'

// Calculate point on line (a to b, at length).
const linePoint = (a, b, length) => {
    let dir = b.clone().sub(a).normalize().multiplyScalar(length)
    return a.clone().add(dir)
}

// Model loader.
const Model = memo(({ path, ...props }) => {
    const model = useGLTF(path)
    return <primitive object={model.scene} {...props} />
})

// Wheels.
const Wheels = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, offset, wheelbase, axleHeight, color, roughness }) => {
    const { setObjectMaterials } = useMaterialProperties()

    // Load models.
    const rimGltf = useGLTF(vehicleConfigs.wheels.rims[rim].model)
    const tireGltf = useGLTF(vehicleConfigs.wheels.tires[tire].model)

    // Scale tires.
    const tireGeometry = useMemo(() => {
        // Determine y scale as a percentage of width.
        const wheelWidth = (rim_width * 2.54) / 100
        const wheelWidthScale = wheelWidth / vehicleConfigs.wheels.tires[tire].width

        const tireOD = vehicleConfigs.wheels.tires[tire].od / 2
        const tireID = vehicleConfigs.wheels.tires[tire].id / 2

        const newOd = (tire_diameter * 2.54) / 10 / 2
        const newId = (rim_diameter * 2.54) / 10 / 2

        // Create a copy of the original geometry.
        const geometry = tireGltf.scene.children[0].geometry.clone()

        // Scale to match wheel width.
        geometry.scale(1, 1, wheelWidthScale)

        // Get position attributes.
        const positionAttribute = geometry.getAttribute('position')
        const positionArray = positionAttribute.array

        // Loop through vertices.
        for (var i = 0, l = positionAttribute.count; i < l; i++) {
            // Start vector.
            let startVector = new Vector3().fromBufferAttribute(positionAttribute, i)

            // Center vector.
            let centerVector = new Vector3(0, 0, startVector.z)

            // Distance from center.
            let centerDist = centerVector.distanceTo(startVector)

            // Distance from rim.
            let rimDist = centerDist - tireID

            // Percentage from rim.
            let percentOut = rimDist / (tireOD - tireID)

            // New distance from center.
            let newRimDist = (percentOut * (newOd - newId) + newId) / 10

            // End vector.
            let setVector = linePoint(centerVector, startVector, newRimDist)

            // Set x,y
            positionArray[i * 3] = setVector.x
            positionArray[i * 3 + 1] = setVector.y
        }

        return geometry
    }, [tireGltf.scene.children, rim_diameter, rim_width, tire, tire_diameter])

    // Calculate rim scale as a percentage of diameter.
    const odScale = useMemo(() => ((rim_diameter * 2.54) / 100 + 0.03175) / vehicleConfigs.wheels.rims[rim].od, [rim, rim_diameter])

    // Calculate rim width.
    const widthScale = useMemo(() => (rim_width * 2.54) / 100 / vehicleConfigs.wheels.rims[rim].width, [rim, rim_width])

    // Set rim color.
    useEffect(() => {
        setObjectMaterials(rimGltf.scene, color, roughness, rim_color, rim_color_secondary)
    }, [rimGltf.scene, setObjectMaterials, rim_color, rim_color_secondary, color, roughness])

    // Build wheel transforms.
    const wheelTransforms = useMemo(() => {
        const rotation = (Math.PI * 90) / 180
        const steering = (Math.PI * -10) / 180
        return [
            { key: 'FL', name: 'FL', position: [offset, axleHeight, wheelbase / 2], rotation: [0, rotation + steering, 0] },
            { key: 'FR', name: 'FR', position: [-offset, axleHeight, wheelbase / 2], rotation: [0, -rotation + steering, 0] },
            { key: 'RL', name: 'RL', position: [offset, axleHeight, -wheelbase / 2], rotation: [0, rotation, 0] },
            { key: 'RR', name: 'RR', position: [-offset, axleHeight, -wheelbase / 2], rotation: [0, -rotation, 0] },
        ]
    }, [offset, axleHeight, wheelbase])

    return (
        <group name='Wheels'>
            {wheelTransforms.map((transform) => (
                <group {...transform}>
                    <primitive name='Rim' object={rimGltf.scene.clone()} scale={[odScale, odScale, widthScale]} />
                    <mesh name='Tire' geometry={tireGeometry} castShadow>
                        <meshStandardMaterial color='#121212' />
                    </mesh>
                </group>
            ))}
        </group>
    )
})

// Body.
const Body = memo(({ id, height, color, roughness, addons, setVehicle }) => {
    const vehicle = useRef()
    const { setObjectMaterials } = useMaterialProperties()

    // Set body color.
    useEffect(() => {
        setObjectMaterials(vehicle.current, color, roughness)
    }, [setObjectMaterials, color, roughness, addons])

    // Set default addons.
    useEffect(() => {
        setVehicle({ addons: vehicleConfigs.vehicles[id].default_addons })
    }, [setVehicle, id])

    // Build array of addon paths.
    const addonPaths = useMemo(() => {
        return Object.entries(addons)
            .filter(([type, value]) => vehicleConfigs.vehicles[id]['addons'][type]?.['options'][value])
            .map(([type, value]) => {
                // Return path.
                return vehicleConfigs.vehicles[id]['addons'][type]['options'][value]['model']
            })
    }, [id, addons])

    // Animate height.
    useAnimateHeight(vehicle, height, height + 0.1)

    return (
        <group ref={vehicle} name='Body' key={id}>
            <Model path={vehicleConfigs.vehicles[id].model} />
            {addonPaths.length ? (
                <group name='Addons'>
                    {addonPaths.map((addon) => (
                        <Model key={addon} path={addon} />
                    ))}
                </group>
            ) : null}
        </group>
    )
})

// Vehicle.
const Vehicle = ({ currentVehicle, setVehicle }) => {
    const { id, color, roughness, lift, wheel_offset, rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, addons } = currentVehicle

    // Get wheel (axle) height.
    const axleHeight = useMemo(() => {
        return (tire_diameter * 2.54) / 100 / 2
    }, [tire_diameter])

    // Get lift height in meters.
    const liftHeight = useMemo(() => {
        const liftInches = lift || 0
        return (liftInches * 2.54) / 100
    }, [lift])

    // Get vehicle height.
    const vehicleHeight = useMemo(() => {
        return axleHeight + liftHeight
    }, [axleHeight, liftHeight])

    const offset = vehicleConfigs.vehicles[id]['wheel_offset'] + parseFloat(wheel_offset)
    const wheelbase = vehicleConfigs.vehicles[id]['wheelbase']

    return (
        <group name='Vehicle'>
            <Body key={id} id={id} height={vehicleHeight} color={color} roughness={roughness} addons={addons} setVehicle={setVehicle} />
            <Wheels
                rim={rim}
                rim_diameter={rim_diameter}
                rim_width={rim_width}
                rim_color={rim_color}
                rim_color_secondary={rim_color_secondary}
                tire={tire}
                tire_diameter={tire_diameter}
                offset={offset}
                axleHeight={axleHeight}
                wheelbase={wheelbase}
                color={color}
                roughness={roughness}
            />
        </group>
    )
}

export default Vehicle
