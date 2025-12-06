import { memo, useMemo, useRef, useEffect, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { useGLTF, Gltf } from '@react-three/drei'
import { useXR } from '@react-three/xr'
import { Vector3, Quaternion } from 'three'

import useGameStore, { vehicleState } from '../../store/gameStore'
import useInputStore from '../../store/inputStore'
import vehicleConfigs from '../../vehicleConfigs'
import useAnimateHeight from '../../hooks/useAnimateHeight'
import useVehiclePhysics from '../../hooks/useVehiclePhysics'
import useMaterialProperties from '../../hooks/useMaterialProperties'
import useTireDirtMaterial from '../../hooks/useTireDirtMaterial'
import EngineAudio from './EngineAudio'
import Dust from './Dust'

// Calculate point on line (a to b, at length).
const linePoint = (a, b, length) => {
	let dir = b.clone().sub(a).normalize().multiplyScalar(length)
	return a.clone().add(dir)
}

// Rim component - loads and renders a single rim
const Rim = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, color, roughness }) => {
	const { setObjectMaterials } = useMaterialProperties()

	// Load rim model
	const rimGltf = useGLTF(vehicleConfigs.wheels.rims[rim].model)

	// Clone rim scene
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

// Tire component - loads and renders a single tire
const Tire = memo(({ tire, tire_diameter, tire_muddiness, rim_diameter, rim_width }) => {
	// Load tire model
	const tireGltf = useGLTF(vehicleConfigs.wheels.tires[tire].model)

	// Scale tire.
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

	// Calculate tire radius for shader
	const tireRadius = useMemo(() => (tire_diameter * 2.54) / 100 / 2, [tire_diameter])
	const rimRadius = useMemo(() => (rim_diameter * 2.54) / 100 / 2, [rim_diameter])

	// Create dirt shader callback
	const dirtShaderCallback = useTireDirtMaterial({ tireRadius, rimRadius, coverage: tire_muddiness })

	return (
		<mesh name='Tire' geometry={tireGeometry} castShadow receiveShadow>
			<meshStandardMaterial color='#121212' metalness={0} roughness={0.75} flatShading={true} onBeforeCompile={dirtShaderCallback} />
		</mesh>
	)
})

// Wheels - container component that positions wheel groups
const Wheels = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, tire_muddiness, color, roughness, wheelPositions, wheelRefs }) => {
	return (
		<group name='Wheels'>
			{wheelPositions.map(({ key, rotation, ...transform }, index) => (
				<group key={key} ref={wheelRefs[index]} {...transform}>
					{/* Add an inner group with the correct visual rotation */}
					<group rotation={rotation}>
						<Suspense fallback={null}>
							<Rim
								rim={rim}
								rim_diameter={rim_diameter}
								rim_width={rim_width}
								rim_color={rim_color}
								rim_color_secondary={rim_color_secondary}
								color={color}
								roughness={roughness}
							/>
						</Suspense>
						<Suspense fallback={null}>
							<Tire tire={tire} tire_diameter={tire_diameter} tire_muddiness={tire_muddiness} rim_diameter={rim_diameter} rim_width={rim_width} />
						</Suspense>
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
	const { body, color, roughness, lift, wheel_offset, rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, tire_muddiness, addons } = {
		...vehicleConfigs.defaults,
		...props,
	}

	// Get vehicle store
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const xrOriginRef = useGameStore((state) => state.xrOriginRef)
	const insideVehicle = useGameStore((state) => state.insideVehicle)
	const setInsideVehicle = useGameStore((state) => state.setInsideVehicle)

	// Track toggle button state to detect press (not hold)
	const togglePressedLastFrame = useRef(false)

	// Check if in XR session
	const isInXR = useXR((state) => state.mode !== null)

	// Seat offset relative to vehicle body (driver position)
	// Y is relative to the body, which is already positioned at vehicleHeight
	const seatOffset = useMemo(() => new Vector3(0.35, 0.15, 0.2), [])

	// 180 degree rotation to face forward
	const seatYawOffset = useMemo(() => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI), [])

	const chassisRef = useRef(null)
	const chassisGroupRef = useRef(null) // Reference to the visual group that follows interpolated physics
	const wheelRefsArray = useRef([{ current: null }, { current: null }, { current: null }, { current: null }])
	const wheelRefs = wheelRefsArray.current

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
	const wheelPositions = useMemo(
		() => [
			{ key: 'FL', name: 'FL', position: [offset, axleHeight, wheelbase / 2], rotation: [0, rotation, 0] },
			{ key: 'FR', name: 'FR', position: [-offset, axleHeight, wheelbase / 2], rotation: [0, -rotation, 0] },
			{ key: 'RL', name: 'RL', position: [offset, axleHeight, -wheelbase / 2], rotation: [0, rotation, 0] },
			{ key: 'RR', name: 'RR', position: [-offset, axleHeight, -wheelbase / 2], rotation: [0, -rotation, 0] },
		],
		[offset, axleHeight, wheelbase, rotation]
	)

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

	// Reusable vectors/quaternions to avoid GC pressure
	const tempWorldPos = useMemo(() => new Vector3(), [])
	const tempQuat = useMemo(() => new Quaternion(), [])
	const tempSeatOffset = useMemo(() => new Vector3(), [])

	// Update camera target and XR origin each frame
	// Use the visual group's world position which is interpolated by Rapier
	useFrame(() => {
		if (!chassisGroupRef.current) return

		// Check for toggle input (V key or X button) - trigger on press, not hold
		const { keys, input } = useInputStore.getState()
		const togglePressed = keys.has('c') || keys.has('C') || input.buttonX
		if (togglePressed && !togglePressedLastFrame.current) {
			setInsideVehicle(!insideVehicle)
		}
		togglePressedLastFrame.current = togglePressed

		// Get interpolated world position and quaternion from the visual group
		chassisGroupRef.current.getWorldPosition(tempWorldPos)
		chassisGroupRef.current.getWorldQuaternion(tempQuat)

		// Update vehicle position for camera and other systems
		vehicleState.position.copy(tempWorldPos)

		// Update XR origin to follow vehicle when inside
		if (insideVehicle && xrOriginRef?.current) {
			// Calculate seat world position (offset is relative to body, add vehicleHeight)
			tempSeatOffset.copy(seatOffset).applyQuaternion(tempQuat)

			xrOriginRef.current.position.set(
				tempWorldPos.x + tempSeatOffset.x,
				tempWorldPos.y + tempSeatOffset.y + vehicleHeight,
				tempWorldPos.z + tempSeatOffset.z
			)
			// Apply chassis rotation plus 180° yaw to face forward
			xrOriginRef.current.quaternion.copy(tempQuat).multiply(seatYawOffset)
		}
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
			{!performanceDegraded && !isInXR && <Dust vehicleController={vehicleController} wheelRefs={wheelRefs} />}
		</>
	)
}

export default Vehicle
