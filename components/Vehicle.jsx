import { memo, useMemo, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { useGLTF, Gltf } from '@react-three/drei'
import { Vector3 } from 'three'

import useGameStore from '../store/gameStore'
import vehicleConfigs from '../vehicleConfigs'
import useAnimateHeight from '../hooks/useAnimateHeight'
import useVehiclePhysics from '../hooks/useVehiclePhysics'
import useMaterialProperties from '../hooks/useMaterialProperties'

// Calculate point on line (a to b, at length).
const linePoint = (a, b, length) => {
    let dir = b.clone().sub(a).normalize().multiplyScalar(length)
    return a.clone().add(dir)
}

// Wheels.
const Wheels = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, color, roughness, wheelPositions, wheelRefs }) => {
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

    return (
        <group name='Wheels'>
            {wheelPositions.map(({ key, rotation, ...transform }, index) => (
                <group key={key} ref={wheelRefs[index]} {...transform}>
                    {/* Add an inner group with the correct visual rotation */}
                    <group rotation={rotation}>
                        <primitive name='Rim' object={rimGltf.scene.clone()} scale={[odScale, odScale, widthScale]} />
                        <mesh name='Tire' geometry={tireGeometry} castShadow>
                            <meshStandardMaterial color='#121212' />
                        </mesh>
                    </group>
                </group>
            ))}
        </group>
    )
})

// Body.
const Body = memo(({ id, height, color, roughness, addons }) => {
    const vehicle = useRef()
    const { setObjectMaterials } = useMaterialProperties()

    // Set body color.
    useEffect(() => {
        setObjectMaterials(vehicle.current, color, roughness)
    }, [setObjectMaterials, color, roughness, addons])

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
            <Gltf src={vehicleConfigs.vehicles[id].model} />
            {addonPaths.length ? (
                <group name='Addons'>
                    {addonPaths.map((addon) => (
                        <Gltf key={addon} src={addon} />
                    ))}
                </group>
            ) : null}
        </group>
    )
})

// Vehicle component with physics
const Vehicle = (props) => {
    // Get vehicle properties from props or defaults
    const { body, color, roughness, lift, wheel_offset, rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, addons } = {
        ...vehicleConfigs.defaults,
        ...props,
    }

    // Get vehicle store
    const setCameraTarget = useGameStore((state) => state.setCameraTarget)

    const chassisRef = useRef(null)
    const wheelRefs = [useRef(null), useRef(null), useRef(null), useRef(null)]

    // Get wheel (axle) height
    const axleHeight = useMemo(() => (tire_diameter * 2.54) / 100 / 2, [tire_diameter])

    // Get lift height in meters
    const liftHeight = useMemo(() => ((lift || 0) * 2.54) / 100, [lift])

    // Get vehicle height
    const vehicleHeight = useMemo(() => axleHeight + liftHeight, [axleHeight, liftHeight])

    // Get wheel offset and wheelbase
    const offset = vehicleConfigs.vehicles[body]['wheel_offset'] + parseFloat(wheel_offset)
    const wheelbase = vehicleConfigs.vehicles[body]['wheelbase']

    // Get wheel rotation
    const rotation = (Math.PI * 90) / 180

    // Set wheel positions
    const wheelPositions = [
        { key: 'FL', name: 'FL', position: [offset, axleHeight, wheelbase / 2], rotation: [0, rotation, 0] },
        { key: 'FR', name: 'FR', position: [-offset, axleHeight, wheelbase / 2], rotation: [0, -rotation, 0] },
        { key: 'RL', name: 'RL', position: [offset, axleHeight, -wheelbase / 2], rotation: [0, rotation, 0] },
        { key: 'RR', name: 'RR', position: [-offset, axleHeight, -wheelbase / 2], rotation: [0, -rotation, 0] },
    ]

    // Create wheel configurations
    const physicsWheels = useMemo(() => {
        return wheelPositions.map((wheel, i) => ({
            ref: wheelRefs[i],
            axleCs: new Vector3(1, 0, 0),
            position: new Vector3(...wheel.position),
            suspensionDirection: new Vector3(0, -1, 0),
            maxSuspensionTravel: 0.3,
            suspensionRestLength: 0.1,
            suspensionStiffness: 28,
            radius: (tire_diameter * 2.54) / 100 / 2,
        }))
    }, [offset, axleHeight, wheelbase, tire_diameter])

    // Use vehicle physics
    useVehiclePhysics(chassisRef, physicsWheels)

    // Update camera target each frame
    useFrame(() => {
        if (chassisRef.current) {
            // Get chassis position
            const { x, y, z } = chassisRef.current.translation()
            // Set camera target
            setCameraTarget(x, y + 0.95, z)
        }
    })

    // Collider props
    const colliderArgs = useMemo(() => [1, 0.5, wheelbase / 2 + axleHeight], [wheelbase, axleHeight])
    const colliderPosition = useMemo(() => [0, 1, 0], [])

    return (
        <RigidBody ref={chassisRef} type='dynamic' colliders={false} canSleep={false} angularDamping={1}>
            <CuboidCollider args={colliderArgs} position={colliderPosition} />
            <group name='Vehicle'>
                <Body key={body} id={body} height={vehicleHeight} color={color} roughness={roughness} addons={addons} />
                <Wheels
                    rim={rim}
                    rim_diameter={rim_diameter}
                    rim_width={rim_width}
                    rim_color={rim_color}
                    rim_color_secondary={rim_color_secondary}
                    tire={tire}
                    tire_diameter={tire_diameter}
                    color={color}
                    roughness={roughness}
                    wheelPositions={wheelPositions}
                    wheelRefs={wheelRefs}
                />
            </group>
        </RigidBody>
    )
}

export default Vehicle
