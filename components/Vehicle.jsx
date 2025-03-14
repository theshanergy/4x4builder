import { memo, useMemo, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { useGLTF, useKeyboardControls } from '@react-three/drei'
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

// Model loader.
const Model = memo(({ path, ...props }) => {
    const model = useGLTF(path)
    return <primitive object={model.scene} {...props} />
})

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

// Vehicle component with physics
const Vehicle = () => {
    // Use individual selectors for better performance
    const id = useGameStore((state) => state.currentVehicle.id)
    const color = useGameStore((state) => state.currentVehicle.color)
    const roughness = useGameStore((state) => state.currentVehicle.roughness)
    const lift = useGameStore((state) => state.currentVehicle.lift)
    const wheel_offset = useGameStore((state) => state.currentVehicle.wheel_offset)
    const rim = useGameStore((state) => state.currentVehicle.rim)
    const rim_diameter = useGameStore((state) => state.currentVehicle.rim_diameter)
    const rim_width = useGameStore((state) => state.currentVehicle.rim_width)
    const rim_color = useGameStore((state) => state.currentVehicle.rim_color)
    const rim_color_secondary = useGameStore((state) => state.currentVehicle.rim_color_secondary)
    const tire = useGameStore((state) => state.currentVehicle.tire)
    const tire_diameter = useGameStore((state) => state.currentVehicle.tire_diameter)
    const addons = useGameStore((state) => state.currentVehicle.addons)
    const setVehicle = useGameStore((state) => state.setVehicle)
    const setCameraTarget = useGameStore((state) => state.setCameraTarget)

    const chassisRef = useRef(null)
    const wheelRefs = [useRef(null), useRef(null), useRef(null), useRef(null)]

    // Get keyboard controls
    const [, getKeys] = useKeyboardControls()

    // Get wheel (axle) height
    const axleHeight = useMemo(() => (tire_diameter * 2.54) / 100 / 2, [tire_diameter])

    // Get lift height in meters
    const liftHeight = useMemo(() => ((lift || 0) * 2.54) / 100, [lift])

    // Get vehicle height
    const vehicleHeight = useMemo(() => axleHeight + liftHeight, [axleHeight, liftHeight])

    const offset = vehicleConfigs.vehicles[id]['wheel_offset'] + parseFloat(wheel_offset)
    const wheelbase = vehicleConfigs.vehicles[id]['wheelbase']

    // Physics constants
    const FORCES = { accelerate: 30, brake: 0.5, steerAngle: Math.PI / 6 }

    const rotation = (Math.PI * 90) / 180
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
    const { applyEngineForce, applySteering, applyBrake } = useVehiclePhysics(chassisRef, physicsWheels)

    // Apply input forces each frame
    useFrame(() => {
        const { forward, backward, left, right, brake } = getKeys()

        // Calculate forces
        const engineForce = (forward ? -FORCES.accelerate : 0) + (backward ? FORCES.accelerate : 0)
        const steerForce = (left ? FORCES.steerAngle : 0) + (right ? -FORCES.steerAngle : 0)
        const brakeForce = brake ? FORCES.brake : 0

        // Front wheels steering
        for (let i = 0; i < 2; i++) {
            applySteering(i, steerForce)
        }

        // Rear wheels driving
        for (let i = 2; i < 4; i++) {
            applyEngineForce(i, engineForce)
        }

        // All wheels braking
        for (let i = 0; i < 4; i++) {
            applyBrake(i, brakeForce)
        }

        if (chassisRef.current) {
            // Set the camera target to the chassis position
            setCameraTarget({
                x: chassisRef.current.translation().x,
                y: chassisRef.current.translation().y + 0.95,
                z: chassisRef.current.translation().z,
            })
        }
    })

    return (
        <RigidBody ref={chassisRef} type='dynamic' colliders={false} position-y={vehicleHeight + 0.5} canSleep={false}>
            <CuboidCollider args={[1, 0.5, (wheelbase / 2) + axleHeight]} position={[0, 1, 0]} />
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
