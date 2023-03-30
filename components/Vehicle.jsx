import React, { useMemo, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { Vector3 } from 'three'
import useAnimateHeight from '../hooks/useAnimateHeight'
import vehicleConfigs from '../vehicleConfigs'
import useMaterialProperties from '../hooks/useMaterialProperties'

// Rim.
const Rim = ({ vehicle }) => {
    const { rim, rim_diameter, rim_width } = vehicle
    const { setObjectColor } = useMaterialProperties(vehicle)

    // Load model.
    const rimGltf = useGLTF(vehicleConfigs.wheels.rims[rim].model)

    // Create instance.
    const rimScene = useMemo(() => rimGltf.scene.clone(), [rimGltf.scene])

    // Calculate rim scale.
    const [odScale, widthScale] = useMemo(() => {
        if (!rim) return [1, 1]

        // determine rim scale as a percentage of diameter.
        const od = (rim_diameter * 2.54) / 100
        const odScale = (od + 0.03175) / vehicleConfigs.wheels.rims[rim].od

        const width = (rim_width * 2.54) / 100
        const widthScale = width / vehicleConfigs.wheels.rims[rim].width

        return [odScale, widthScale]
    }, [rim, rim_diameter, rim_width])

    // Set rim color.
    useEffect(() => {
        setObjectColor(rimScene)
    }, [rimScene, setObjectColor, vehicle.rim_color, vehicle.rim_color_secondary])

    return <primitive object={rimScene} scale={[odScale, odScale, widthScale]} />
}

// Tire
const Tire = ({ vehicle }) => {
    const { rim_diameter, rim_width, tire, tire_diameter } = vehicle
    const { setObjectColor } = useMaterialProperties(vehicle)

    // Load model.
    const tireGltf = useGLTF(vehicleConfigs.wheels.tires[tire].model)

    // Create instance.
    const tireScene = useMemo(() => tireGltf.scene.clone(), [tireGltf.scene])

    // Calculate point on line (a to b, at length).
    const linePoint = (a, b, length) => {
        let dir = b.clone().sub(a).normalize().multiplyScalar(length)
        return a.clone().add(dir)
    }

    // Scale tires.
    useEffect(() => {
        if (!tire) return

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

        // Loop through vertices.
        for (var i = 0, l = geometry.attributes.position.count; i < l; i++) {
            // Start vector.
            let startVector = new Vector3().fromBufferAttribute(geometry.getAttribute('position'), i)

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
            geometry.attributes.position.setX(i, setVector.x)
            geometry.attributes.position.setY(i, setVector.y)
        }

        // Update geometry.
        geometry.attributes.position.needsUpdate = true

        // Overwrite tire geometry.
        tireScene.children[0].geometry = geometry
    }, [tireScene, tireGltf.scene.children, rim_diameter, rim_width, tire, tire_diameter])

    // Set color.
    useEffect(() => {
        setObjectColor(tireScene)
    }, [tireScene, setObjectColor])

    return <primitive object={tireScene} />
}

// Wheel.
const Wheel = ({ vehicle, ...props }) => {
    return (
        <group {...props}>
            <Rim vehicle={vehicle} />
            <Tire vehicle={vehicle} />
        </group>
    )
}

// Wheels.
const Wheels = ({ vehicle, ...props }) => {
    const offset = vehicleConfigs.vehicles[vehicle.id]['wheel_offset'] + parseFloat(vehicle.wheel_offset)
    const wheelbase = vehicleConfigs.vehicles[vehicle.id]['wheelbase']

    const rotation = (Math.PI * 90) / 180
    const steering = (Math.PI * -10) / 180

    const wheelTransforms = useMemo(
        () => [
            { key: 'FL', position: [offset, 0, wheelbase / 2], rotation: [0, rotation + steering, 0] },
            { key: 'FR', position: [-offset, 0, wheelbase / 2], rotation: [0, -rotation + steering, 0] },
            { key: 'RL', position: [offset, 0, -wheelbase / 2], rotation: [0, rotation, 0] },
            { key: 'RR', position: [-offset, 0, -wheelbase / 2], rotation: [0, -rotation, 0] },
        ],
        [offset, wheelbase, rotation, steering]
    )

    return (
        <group {...props}>
            {wheelTransforms.map((transform) => (
                <Wheel vehicle={vehicle} {...transform} />
            ))}
        </group>
    )
}

const Body = ({ vehicle, vehicleHeight }) => {
    const { setObjectColor } = useMaterialProperties(vehicle)
    const vehicleGltf = useGLTF(vehicleConfigs.vehicles[vehicle.id].model)

    // Set vehicle color.
    useEffect(() => {
        setObjectColor(vehicleGltf.scene)
    }, [setObjectColor, vehicleGltf.scene, vehicle.color, vehicle.roughness])

    // Animate height.
    const animatedHeight = useAnimateHeight(vehicleHeight, vehicleHeight + 0.1)

    return <primitive object={vehicleGltf.scene} position-y={animatedHeight} />
}

const Addon = ({ vehicle, path }) => {
    const { setObjectColor } = useMaterialProperties(vehicle)
    const addonGltf = useGLTF(path)

    // Set color.
    useEffect(() => {
        setObjectColor(addonGltf.scene)
    }, [setObjectColor, addonGltf.scene, vehicle.color, vehicle.roughness])

    return <primitive object={addonGltf.scene} />
}

// Addons.
const Addons = ({ vehicle, setVehicle }) => {
    useEffect(() => {
        setVehicle({ addons: vehicleConfigs.vehicles[vehicle.id].default_addons })
    }, [setVehicle, vehicle.id])

    return (
        <group>
            {Object.entries(vehicle.addons).map(([key, value]) => {
                if (vehicleConfigs.vehicles[vehicle.id]['addons'][key] && vehicleConfigs.vehicles[vehicle.id]['addons'][key]['options'][value]) {
                    const path = vehicleConfigs.vehicles[vehicle.id]['addons'][key]['options'][value]['model']
                    return <Addon key={path} vehicle={vehicle} path={path} />
                }
                return null
            })}
        </group>
    )
}

// Vehicle.
const Vehicle = ({ vehicle, setVehicle }) => {
    // Get wheel (axle) height.
    const axleHeight = useMemo(() => {
        return (vehicle.tire_diameter * 2.54) / 100 / 2
    }, [vehicle.tire_diameter])

    // Get lift height in meters.
    const liftHeight = useMemo(() => {
        const liftInches = vehicle.lift || 0
        return (liftInches * 2.54) / 100
    }, [vehicle.lift])

    // Get vehicle height.
    const vehicleHeight = useMemo(() => {
        return axleHeight + liftHeight
    }, [axleHeight, liftHeight])

    return (
        <group>
            <Body key={vehicle.id} vehicle={vehicle} vehicleHeight={vehicleHeight}>
                <Addons vehicle={vehicle} setVehicle={setVehicle} />
            </Body>
            <Wheels vehicle={vehicle} position={[0, axleHeight, 0]} />
        </group>
    )
}

export default Vehicle
