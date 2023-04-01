import React, { memo, useMemo, useEffect, useCallback, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { Vector3 } from 'three'
import useAnimateHeight from '../hooks/useAnimateHeight'
import vehicleConfigs from '../vehicleConfigs'
import useMaterialProperties from '../hooks/useMaterialProperties'

// Rim.
const Rim = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, color, roughness }) => {
    const { setObjectMaterials } = useMaterialProperties()

    // Load model.
    const rimGltf = useGLTF(vehicleConfigs.wheels.rims[rim].model)

    // Create instance.
    const rimScene = useMemo(() => rimGltf.scene.clone(), [rimGltf.scene])

    // Calculate rim scale as a percentage of diameter.
    const odScale = useMemo(() => ((rim_diameter * 2.54) / 100 + 0.03175) / vehicleConfigs.wheels.rims[rim].od, [rim, rim_diameter])

    // Calculate rim width.
    const widthScale = useMemo(() => (rim_width * 2.54) / 100 / vehicleConfigs.wheels.rims[rim].width, [rim, rim_width])

    // Set rim color.
    useEffect(() => {
        setObjectMaterials(rimScene, color, roughness, rim_color, rim_color_secondary)
    }, [rimScene, setObjectMaterials, rim_color, rim_color_secondary, color, roughness])

    return <primitive name='Rim' object={rimScene} scale={[odScale, odScale, widthScale]} />
})

// Tire
const Tire = memo(({ rim_diameter, rim_width, tire, tire_diameter }) => {
    const { setObjectMaterials } = useMaterialProperties(vehicle)

    // Load model.
    const tireGltf = useGLTF(vehicleConfigs.wheels.tires[tire].model)

    // Create instance.
    const tireScene = useMemo(() => tireGltf.scene.clone(), [tireGltf.scene])

    // Calculate point on line (a to b, at length).
    const linePoint = useCallback((a, b, length) => {
        let dir = b.clone().sub(a).normalize().multiplyScalar(length)
        return a.clone().add(dir)
    })

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
        setObjectMaterials(tireScene)
    }, [setObjectMaterials, tireScene])

    return <primitive name='Tire' object={tireScene} />
})

// Wheels.
const Wheels = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, offset, wheelbase, axleHeight, color, roughness }) => {
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
                    <Rim
                        rim={rim}
                        rim_diameter={rim_diameter}
                        rim_width={rim_width}
                        rim_color={rim_color}
                        rim_color_secondary={rim_color_secondary}
                        color={color}
                        roughness={roughness}
                    />
                    <Tire tire={tire} tire_diameter={tire_diameter} rim_diameter={rim_diameter} rim_width={rim_width} />
                </group>
            ))}
        </group>
    )
})

// Body.
const Body = memo(({ id, height, color, roughness, addons, setVehicle }) => {
    const vehicle = useRef()
    const { setObjectMaterials } = useMaterialProperties()

    // Load body model.
    const vehicleGltf = useGLTF(vehicleConfigs.vehicles[id].model)

    // Set body color.
    useEffect(() => {
        setObjectMaterials(vehicle.current, color, roughness)
    }, [setObjectMaterials, vehicleGltf.scene, color, roughness, addons])

    // Set default addons.
    useEffect(() => {
        setVehicle({ addons: vehicleConfigs.vehicles[id].default_addons })
    }, [setVehicle, id])

    // Load addons.
    const addonsModels = useMemo(() => {
        return Object.entries(addons)
            .filter(([type, value]) => vehicleConfigs.vehicles[id]['addons'][type]?.['options'][value])
            .map(([type, value]) => {
                const modelPath = vehicleConfigs.vehicles[id]['addons'][type]['options'][value]['model']
                const model = useGLTF(modelPath)
                model.scene.name = type + '_' + value
                return model.scene
            })
    }, [id, addons])

    // Animate height.
    const animatedHeight = useAnimateHeight(height, height + 0.1)

    return (
        <group ref={vehicle} position-y={animatedHeight}>
            <primitive name='Body' object={vehicleGltf.scene} />
            <group name='Addons'>
                {addonsModels.map((model) => (
                    <primitive key={model.name} object={model} />
                ))}
            </group>
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
        <group>
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
