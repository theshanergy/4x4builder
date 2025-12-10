import { memo, useMemo, useRef, useEffect, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { Gltf } from '@react-three/drei'
import { useXR } from '@react-three/xr'
import { Vector3, Quaternion } from 'three'

import useGameStore, { vehicleState } from '../../store/gameStore'
import vehicleConfigs from '../../vehicleConfigs'
import useAnimateHeight from '../../hooks/useAnimateHeight'
import useVehiclePhysics from '../../hooks/useVehiclePhysics'
import useMaterialProperties from '../../hooks/useMaterialProperties'
import useTransformBroadcast from '../../hooks/useTransformBroadcast'
import useVehicleDimensions from '../../hooks/useVehicleDimensions'
import EngineAudio from './EngineAudio'
import Dust from './Dust'
import TireTracks from './TireTracks'
import Wheels from './Wheels'

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
	const config = {
		...vehicleConfigs.defaults,
		...props,
	}
	const { body, color, roughness, rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, tire_muddiness, addons } = config

	// Get vehicle store
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const isMobile = useGameStore((state) => state.isMobile)

	// Check if in XR session
	const isInXR = useXR((state) => state.mode !== null)

	const chassisRef = useRef(null)
	const chassisGroupRef = useRef(null) // Reference to the visual group that follows interpolated physics
	const wheelRefsArray = useRef([{ current: null }, { current: null }, { current: null }, { current: null }])
	const wheelRefs = wheelRefsArray.current

	// Get vehicle dimensions and wheel positions from shared hook
	const { axleHeight, vehicleHeight, wheelbase, wheelPositions } = useVehicleDimensions(config)

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
	}, [wheelPositions, tire_diameter])

	// Use vehicle physics
	const { vehicleController } = useVehiclePhysics(chassisRef, physicsWheels)

	// Broadcast transform to multiplayer server
	useTransformBroadcast(chassisRef, chassisGroupRef, wheelRefs, vehicleController)

	// Reusable vectors/quaternions to avoid GC pressure
	const tempWorldPos = useMemo(() => new Vector3(), [])
	const tempQuat = useMemo(() => new Quaternion(), [])

	// Update vehicle position for camera and other systems each frame
	// Use the visual group's world position which is interpolated by Rapier
	useFrame(() => {
		if (!chassisGroupRef.current) return

		// Get interpolated world position and quaternion from the visual group
		chassisGroupRef.current.getWorldPosition(tempWorldPos)
		chassisGroupRef.current.getWorldQuaternion(tempQuat)

		// Update vehicle position for camera and other systems
		vehicleState.position.copy(tempWorldPos)

		// Calculate heading (yaw) from quaternion for minimap
		const sinYaw = 2 * (tempQuat.w * tempQuat.y + tempQuat.x * tempQuat.z)
		const cosYaw = 1 - 2 * (tempQuat.y * tempQuat.y + tempQuat.x * tempQuat.x)
		vehicleState.heading = Math.atan2(sinYaw, cosYaw)
	})

	// Collider props
	const colliderArgs = useMemo(() => [0.9, 0.5, wheelbase / 2 + axleHeight], [wheelbase, axleHeight])
	const colliderPosition = useMemo(() => [0, 1, 0], [])

	return (
		<>
			<RigidBody ref={chassisRef} type='dynamic' colliders={false} canSleep={false} angularDamping={1}>
				<CuboidCollider args={colliderArgs} position={colliderPosition} />
				<group ref={chassisGroupRef} name='Vehicle'>
					<EngineAudio />
					<Suspense fallback={null}>
						<Body key={body} id={body} height={vehicleHeight} color={color} roughness={roughness} addons={addons} />
					</Suspense>
					<Wheels
						rim={rim}
						rim_diameter={rim_diameter}
						rim_width={rim_width}
						rim_color={rim_color}
						rim_color_secondary={rim_color_secondary}
						tire={tire}
						tire_diameter={tire_diameter}
						tire_muddiness={tire_muddiness}
						color={color}
						roughness={roughness}
						wheelPositions={wheelPositions}
						wheelRefs={wheelRefs}
					/>
				</group>
			</RigidBody>
			{!performanceDegraded && !isInXR && !isMobile && (
				<>
					<Dust vehicleController={vehicleController} wheelRefs={wheelRefs} />
					<TireTracks vehicleController={vehicleController} wheelRefs={wheelRefs} tireWidth={(rim_width * 2.54) / 100} tireRadius={axleHeight} />
				</>
			)}
		</>
	)
}

export default Vehicle
