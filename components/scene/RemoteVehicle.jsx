import { memo, useMemo, useRef, useEffect, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Gltf, Html } from '@react-three/drei'
import { Vector3, Quaternion, MathUtils } from 'three'

import vehicleConfigs from '../../vehicleConfigs'
import useAnimateHeight from '../../hooks/useAnimateHeight'
import useMaterialProperties from '../../hooks/useMaterialProperties'
import useTireDirtMaterial from '../../hooks/useTireDirtMaterial'

// Interpolation settings
const INTERPOLATION_DELAY = 100 // ms - buffer time for smooth interpolation
const INTERPOLATION_SMOOTHING = 0.15 // lerp factor for position/rotation
const MAX_EXTRAPOLATION_TIME = 200 // ms - max time to extrapolate before stopping

// Transform buffer for smooth interpolation
class TransformBuffer {
	constructor(bufferSize = 5) {
		this.buffer = []
		this.bufferSize = bufferSize
	}

	push(transform) {
		this.buffer.push({
			...transform,
			receivedAt: performance.now(),
		})
		if (this.buffer.length > this.bufferSize) {
			this.buffer.shift()
		}
	}

	getLatest() {
		return this.buffer[this.buffer.length - 1] || null
	}

	interpolate(renderTime, interpolationDelay = INTERPOLATION_DELAY) {
		if (this.buffer.length === 0) return null
		if (this.buffer.length === 1) return this.buffer[0]

		const targetTime = renderTime - interpolationDelay

		// Find surrounding samples
		let before = null
		let after = null

		for (let i = 0; i < this.buffer.length; i++) {
			if (this.buffer[i].timestamp <= targetTime) {
				before = this.buffer[i]
			} else {
				after = this.buffer[i]
				break
			}
		}

		// If no samples before target time, use oldest
		if (!before) return this.buffer[0]
		// If no samples after target time, extrapolate from latest
		if (!after) {
			const latest = this.buffer[this.buffer.length - 1]
			const timeSinceLatest = renderTime - latest.receivedAt
			
			// Don't extrapolate for too long
			if (timeSinceLatest > MAX_EXTRAPOLATION_TIME) {
				return latest
			}
			
			// Simple velocity-based extrapolation
			if (latest.velocity) {
				const dt = timeSinceLatest / 1000 // Convert to seconds
				return {
					...latest,
					position: [
						latest.position[0] + latest.velocity[0] * dt,
						latest.position[1] + latest.velocity[1] * dt,
						latest.position[2] + latest.velocity[2] * dt,
					],
				}
			}
			return latest
		}

		// Interpolate between before and after
		const t = (targetTime - before.timestamp) / (after.timestamp - before.timestamp)
		const clampedT = MathUtils.clamp(t, 0, 1)

		return {
			position: before.position.map((v, i) => MathUtils.lerp(v, after.position[i], clampedT)),
			rotation: this.slerpQuat(before.rotation, after.rotation, clampedT),
			wheelRotations: before.wheelRotations?.map((v, i) => 
				MathUtils.lerp(v, after.wheelRotations?.[i] || v, clampedT)
			) || [0, 0, 0, 0],
			wheelYPositions: before.wheelYPositions?.map((v, i) => 
				MathUtils.lerp(v, after.wheelYPositions?.[i] || v, clampedT)
			) || null,
			steering: MathUtils.lerp(before.steering || 0, after.steering || 0, clampedT),
			engineRpm: MathUtils.lerp(before.engineRpm || 850, after.engineRpm || 850, clampedT),
			velocity: after.velocity || before.velocity || [0, 0, 0],
		}
	}

	slerpQuat(a, b, t) {
		const qa = new Quaternion(a[0], a[1], a[2], a[3])
		const qb = new Quaternion(b[0], b[1], b[2], b[3])
		qa.slerp(qb, t)
		return [qa.x, qa.y, qa.z, qa.w]
	}

	clear() {
		this.buffer = []
	}
}

// Calculate point on line (a to b, at length).
const linePoint = (a, b, length) => {
	let dir = b.clone().sub(a).normalize().multiplyScalar(length)
	return a.clone().add(dir)
}

// Rim component - loads and renders a single rim
const Rim = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, color, roughness }) => {
	const { setObjectMaterials } = useMaterialProperties()
	const rimGltf = useGLTF(vehicleConfigs.wheels.rims[rim].model)
	const rimScene = useMemo(() => rimGltf.scene.clone(), [rimGltf.scene])

	const odScale = useMemo(() => ((rim_diameter * 2.54) / 100 + 0.03175) / vehicleConfigs.wheels.rims[rim].od, [rim, rim_diameter])
	const widthScale = useMemo(() => (rim_width * 2.54) / 100 / vehicleConfigs.wheels.rims[rim].width, [rim, rim_width])

	useEffect(() => {
		setObjectMaterials(rimScene, color, roughness, rim_color, rim_color_secondary)
	}, [rimScene, setObjectMaterials, rim_color, rim_color_secondary, color, roughness])

	return <primitive name='Rim' object={rimScene} scale={[odScale, odScale, widthScale]} />
})

// Tire component - loads and renders a single tire
const Tire = memo(({ tire, tire_diameter, tire_muddiness, rim_diameter, rim_width }) => {
	const tireGltf = useGLTF(vehicleConfigs.wheels.tires[tire].model)

	const tireGeometry = useMemo(() => {
		const wheelWidth = (rim_width * 2.54) / 100
		const wheelWidthScale = wheelWidth / vehicleConfigs.wheels.tires[tire].width
		const tireOD = vehicleConfigs.wheels.tires[tire].od / 2
		const tireID = vehicleConfigs.wheels.tires[tire].id / 2
		const newOd = (tire_diameter * 2.54) / 10 / 2
		const newId = (rim_diameter * 2.54) / 10 / 2

		const geometry = tireGltf.scene.children[0].geometry.clone()
		geometry.scale(1, 1, wheelWidthScale)

		const positionAttribute = geometry.getAttribute('position')
		const positionArray = positionAttribute.array

		for (var i = 0, l = positionAttribute.count; i < l; i++) {
			let startVector = new Vector3().fromBufferAttribute(positionAttribute, i)
			let centerVector = new Vector3(0, 0, startVector.z)
			let centerDist = centerVector.distanceTo(startVector)
			let rimDist = centerDist - tireID
			let percentOut = rimDist / (tireOD - tireID)
			let newRimDist = (percentOut * (newOd - newId) + newId) / 10
			let setVector = linePoint(centerVector, startVector, newRimDist)
			positionArray[i * 3] = setVector.x
			positionArray[i * 3 + 1] = setVector.y
		}

		return geometry
	}, [tireGltf.scene.children, rim_diameter, rim_width, tire, tire_diameter])

	const tireRadius = useMemo(() => (tire_diameter * 2.54) / 100 / 2, [tire_diameter])
	const rimRadius = useMemo(() => (rim_diameter * 2.54) / 100 / 2, [rim_diameter])
	const dirtShaderCallback = useTireDirtMaterial({ tireRadius, rimRadius, coverage: tire_muddiness })

	return (
		<mesh name='Tire' geometry={tireGeometry} castShadow receiveShadow>
			<meshStandardMaterial color='#121212' metalness={0} roughness={0.75} flatShading={true} onBeforeCompile={dirtShaderCallback} />
		</mesh>
	)
})

// Wheels container for remote vehicle
const RemoteWheels = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, tire_muddiness, color, roughness, wheelPositions, wheelRefs }) => {
	return (
		<group name='Wheels'>
			{wheelPositions.map(({ key, rotation, ...transform }, index) => (
				<group key={key} ref={wheelRefs[index]} {...transform}>
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

// Body component for remote vehicle
const RemoteBody = memo(({ id, height, color, roughness, addons }) => {
	const vehicle = useRef()
	const { setObjectMaterials } = useMaterialProperties()

	useEffect(() => {
		setObjectMaterials(vehicle.current, color, roughness)
	}, [setObjectMaterials, color, roughness, addons])

	const addonPaths = useMemo(() => {
		return Object.entries(addons || {})
			.filter(([type, value]) => vehicleConfigs.vehicles[id]?.['addons']?.[type]?.['options']?.[value])
			.map(([type, value]) => vehicleConfigs.vehicles[id]['addons'][type]['options'][value]['model'])
	}, [id, addons])

	useAnimateHeight(vehicle, height, height + 0.1)

	// Check if vehicle config exists
	if (!vehicleConfigs.vehicles[id]) {
		console.warn(`Unknown vehicle body: ${id}`)
		return null
	}

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

// Player name label above vehicle
const PlayerLabel = memo(({ name }) => {
	return (
		<Html
			position={[0, 2.5, 0]}
			center
			distanceFactor={10}
			occlude={false}
			style={{
				pointerEvents: 'none',
				userSelect: 'none',
			}}
		>
			<div
				style={{
					background: 'rgba(0, 0, 0, 0.7)',
					color: 'white',
					padding: '4px 12px',
					borderRadius: '4px',
					fontSize: '14px',
					fontWeight: '500',
					whiteSpace: 'nowrap',
					fontFamily: 'system-ui, -apple-system, sans-serif',
				}}
			>
				{name}
			</div>
		</Html>
	)
})

/**
 * RemoteVehicle - Visual-only vehicle component for rendering other players
 * No physics simulation - uses interpolation for smooth movement
 */
const RemoteVehicle = ({ playerId, playerName, vehicleConfig, initialTransform, onRef }) => {
	const groupRef = useRef()
	const bufferRef = useRef(new TransformBuffer())
	const wheelRefsArray = useRef([{ current: null }, { current: null }, { current: null }, { current: null }])
	const wheelRefs = wheelRefsArray.current
	
	// Current interpolated state
	const currentPosition = useRef(new Vector3())
	const currentRotation = useRef(new Quaternion())
	const currentSteering = useRef(0)

	// Get vehicle config with defaults
	const config = useMemo(() => ({
		...vehicleConfigs.defaults,
		...vehicleConfig,
	}), [vehicleConfig])

	const { body, color, roughness, lift, wheel_offset, rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, tire_muddiness, addons } = config

	// Validate vehicle body exists
	const validBody = vehicleConfigs.vehicles[body] ? body : vehicleConfigs.defaults.body
	const vehicleData = vehicleConfigs.vehicles[validBody]

	// Calculate dimensions
	const axleHeight = useMemo(() => (tire_diameter * 2.54) / 100 / 2, [tire_diameter])
	const liftHeight = useMemo(() => ((lift || 0) * 2.54) / 100, [lift])
	const vehicleHeight = useMemo(() => axleHeight + liftHeight, [axleHeight, liftHeight])
	const offset = vehicleData.wheel_offset + parseFloat(wheel_offset || 0)
	const wheelbase = vehicleData.wheelbase
	const rotation = (Math.PI * 90) / 180

	// Wheel positions
	const wheelPositions = useMemo(
		() => [
			{ key: 'FL', name: 'FL', position: [offset, axleHeight, wheelbase / 2], rotation: [0, rotation, 0] },
			{ key: 'FR', name: 'FR', position: [-offset, axleHeight, wheelbase / 2], rotation: [0, -rotation, 0] },
			{ key: 'RL', name: 'RL', position: [offset, axleHeight, -wheelbase / 2], rotation: [0, rotation, 0] },
			{ key: 'RR', name: 'RR', position: [-offset, axleHeight, -wheelbase / 2], rotation: [0, -rotation, 0] },
		],
		[offset, axleHeight, wheelbase, rotation]
	)

	// Initialize position from initial transform
	useEffect(() => {
		if (initialTransform?.position) {
			currentPosition.current.set(...initialTransform.position)
			if (groupRef.current) {
				groupRef.current.position.copy(currentPosition.current)
			}
		}
		if (initialTransform?.rotation) {
			currentRotation.current.set(...initialTransform.rotation)
			if (groupRef.current) {
				groupRef.current.quaternion.copy(currentRotation.current)
			}
		}
	}, [])

	// Expose method to push new transform data
	useEffect(() => {
		// Store ref to buffer on the group for external access
		if (groupRef.current) {
			groupRef.current.userData.pushTransform = (transform) => {
				bufferRef.current.push(transform)
			}
			groupRef.current.userData.playerId = playerId
			
			// Notify parent that ref is ready
			onRef?.(groupRef.current)
		}
		
		return () => {
			onRef?.(null)
		}
	}, [playerId, onRef])

	// Interpolate and update position each frame
	useFrame(() => {
		if (!groupRef.current) return

		const now = performance.now()
		const interpolated = bufferRef.current.interpolate(now)

		if (interpolated) {
			// Smoothly lerp to target position
			const targetPos = new Vector3(...interpolated.position)
			currentPosition.current.lerp(targetPos, INTERPOLATION_SMOOTHING)
			groupRef.current.position.copy(currentPosition.current)

			// Smoothly slerp to target rotation
			const targetRot = new Quaternion(...interpolated.rotation)
			currentRotation.current.slerp(targetRot, INTERPOLATION_SMOOTHING)
			groupRef.current.quaternion.copy(currentRotation.current)

			// Update front wheel steering
			const steering = interpolated.steering || 0
			currentSteering.current = MathUtils.lerp(currentSteering.current, steering, INTERPOLATION_SMOOTHING)
			
			// Update wheel rotations, positions, and steering
			wheelRefs.forEach((ref, i) => {
				if (!ref.current) return
				
				// Update wheel Y position for suspension movement
				if (interpolated.wheelYPositions && interpolated.wheelYPositions[i] !== undefined) {
					ref.current.position.y = interpolated.wheelYPositions[i]
				}
				
				// Apply wheel spin and steering using quaternion (matching physics behavior)
				// Front wheels (0, 1) get steering, rear wheels (2, 3) don't
				const wheelSteering = i < 2 ? currentSteering.current : 0
				const wheelSpin = interpolated.wheelRotations?.[i] || 0
				
				// Create quaternion from steering (Y axis) and spin (X axis)
				// This matches how the physics system applies wheel rotation
				const steeringQuat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), wheelSteering)
				const spinQuat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), wheelSpin)
				ref.current.quaternion.multiplyQuaternions(steeringQuat, spinQuat)
			})
		}
	})

	return (
		<group ref={groupRef} name={`RemoteVehicle-${playerId}`}>
			<PlayerLabel name={playerName || 'Player'} />
			<group name='VehicleBody'>
				<Suspense fallback={null}>
					<RemoteBody key={validBody} id={validBody} height={vehicleHeight} color={color} roughness={roughness} addons={addons} />
				</Suspense>
				<RemoteWheels
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
		</group>
	)
}

export default memo(RemoteVehicle)
