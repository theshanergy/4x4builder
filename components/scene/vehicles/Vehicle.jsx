import { useMemo, useRef, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { useXR } from '@react-three/xr'
import { Vector3, Quaternion } from 'three'

import { shallow } from 'zustand/shallow'
import useGameStore, { vehicleState } from '../../../store/gameStore'
import vehicleConfigs from '../../../vehicleConfigs'
import useVehiclePhysics from '../../../hooks/useVehiclePhysics'
import useTransformBroadcast from '../../../hooks/useTransformBroadcast'
import useVehicleDimensions from '../../../hooks/useVehicleDimensions'
import EngineAudio from './EngineAudio'
import Dust from './Dust'
import TireTracks from './TireTracks'
import Wheels from './Wheels'
import SpareWheel from './SpareWheel'
import VehicleBody from './VehicleBody'

// Vehicle component with physics
const Vehicle = () => {
	// Get current vehicle config from store and merge with defaults
	const currentVehicle = useGameStore((state) => state.currentVehicle, shallow)
	const config = useMemo(
		() => ({
			...vehicleConfigs.defaults,
			...currentVehicle,
		}),
		[currentVehicle]
	)

	// Get vehicle store
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const isMobile = useGameStore((state) => state.isMobile)

	// Check if in XR session
	const isInXR = useXR((state) => state.mode !== null)

	const chassisRef = useRef(null)
	const chassisGroupRef = useRef(null) // Reference to the visual group that follows interpolated physics
	const bodyRef = useRef(null) // Reference to body group for SpareWheel to follow
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
			radius: (config.tire_diameter * 2.54) / 100 / 2,
		}))
	}, [wheelPositions, config.tire_diameter])

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
						<VehicleBody
							ref={bodyRef}
							key={config.body}
							id={config.body}
							height={vehicleHeight}
							color={config.color}
							roughness={config.roughness}
							addons={config.addons}
							lighting={config.lighting}
						/>
					</Suspense>
					<Wheels
						rim={config.rim}
						rim_diameter={config.rim_diameter}
						rim_width={config.rim_width}
						rim_color={config.rim_color}
						rim_color_secondary={config.rim_color_secondary}
						tire={config.tire}
						tire_diameter={config.tire_diameter}
						tire_muddiness={config.tire_muddiness}
						color={config.color}
						roughness={config.roughness}
						wheelPositions={wheelPositions}
						wheelRefs={wheelRefs}
					/>
					<SpareWheel
						bodyId={config.body}
						spare={config.spare}
						bodyRef={bodyRef}
						rim={config.rim}
						rim_diameter={config.rim_diameter}
						rim_width={config.rim_width}
						rim_color={config.rim_color}
						rim_color_secondary={config.rim_color_secondary}
						tire={config.tire}
						tire_diameter={config.tire_diameter}
						color={config.color}
						roughness={config.roughness}
					/>
				</group>
			</RigidBody>
			{!performanceDegraded && !isInXR && !isMobile && (
				<>
					<Dust vehicleController={vehicleController} wheelRefs={wheelRefs} />
					<TireTracks vehicleController={vehicleController} wheelRefs={wheelRefs} tireWidth={(config.rim_width * 2.54) / 100} tireRadius={axleHeight} />
				</>
			)}
		</>
	)
}

export default Vehicle
