import { memo, useMemo, useRef, useEffect, Suspense } from 'react'
import { Vector3, Quaternion, MathUtils } from 'three'
import { useFrame } from '@react-three/fiber'

import vehicleConfigs from '../../../config/vehicles'
import useVehicleDimensions from '../../../hooks/useVehicleDimensions'

import Wheels from './Wheels'
import VehicleBody from './VehicleBody'
import VehicleAudio from './VehicleAudio'
import PlayerLabel from './PlayerLabel'
import TrackLinks from './TrackLinks'

// Interpolation settings
const INTERPOLATION_DELAY = 100 // ms - buffer time for smooth interpolation
const INTERPOLATION_SMOOTHING = 0.15 // lerp factor for position/rotation
const MAX_EXTRAPOLATION_TIME = 200 // ms - max time to extrapolate before stopping
const WHEEL_UP_AXIS = new Vector3(0, 1, 0)
const WHEEL_AXLE_AXIS = new Vector3(1, 0, 0)

const interpolateArray = (beforeArray = [], afterArray = [], t) => {
	const beforeValues = beforeArray || []
	const afterValues = afterArray || []
	const length = Math.max(beforeValues.length, afterValues.length)
	const result = new Array(length)

	for (let i = 0; i < length; i++) {
		const before = beforeValues[i] ?? afterValues[i] ?? 0
		const after = afterValues[i] ?? before
		result[i] = MathUtils.lerp(before, after, t)
	}

	return result
}

// Transform buffer for smooth interpolation
class TransformBuffer {
	constructor(bufferSize = 5) {
		this.buffer = []
		this.bufferSize = bufferSize
		this.qa = new Quaternion()
		this.qb = new Quaternion()
		this.rotationResult = [0, 0, 0, 1]
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
					position: [latest.position[0] + latest.velocity[0] * dt, latest.position[1] + latest.velocity[1] * dt, latest.position[2] + latest.velocity[2] * dt],
				}
			}
			return latest
		}

		// Interpolate between before and after
		const t = (targetTime - before.timestamp) / (after.timestamp - before.timestamp)
		const clampedT = MathUtils.clamp(t, 0, 1)

		return {
			position: interpolateArray(before.position, after.position, clampedT),
			rotation: this.slerpQuat(before.rotation, after.rotation, clampedT),
			wheelRotations: before.wheelRotations || after.wheelRotations ? interpolateArray(before.wheelRotations, after.wheelRotations, clampedT) : [],
			wheelYPositions: before.wheelYPositions || after.wheelYPositions ? interpolateArray(before.wheelYPositions, after.wheelYPositions, clampedT) : null,
			steering: MathUtils.lerp(before.steering ?? 0, after.steering ?? 0, clampedT),
			engineRpm: MathUtils.lerp(before.engineRpm ?? 850, after.engineRpm ?? 850, clampedT),
			hornActive: after.hornActive || false,
			velocity: after.velocity || before.velocity || [0, 0, 0],
		}
	}

	slerpQuat(a, b, t) {
		this.qa.set(a[0], a[1], a[2], a[3])
		this.qb.set(b[0], b[1], b[2], b[3])
		this.qa.slerp(this.qb, t)
		this.rotationResult[0] = this.qa.x
		this.rotationResult[1] = this.qa.y
		this.rotationResult[2] = this.qa.z
		this.rotationResult[3] = this.qa.w
		return this.rotationResult
	}

	clear() {
		this.buffer = []
	}
}

/**
 * RemoteVehicle - Visual-only vehicle component for rendering other players
 * No physics simulation - uses interpolation for smooth movement
 */
const RemoteVehicle = ({ playerId, playerName, vehicleConfig, initialTransform, onRef }) => {
	const groupRef = useRef()
	const bodyRef = useRef(null) // Reference to body group for spare wheel to follow
	const bufferRef = useRef(new TransformBuffer())

	// Current interpolated state
	const currentPosition = useRef(new Vector3())
	const currentRotation = useRef(new Quaternion())
	const currentSteering = useRef(0)
	const currentAudioState = useRef({ rpm: 850, hornActive: false })
	const currentWheelRotations = useRef([])
	const targetPosition = useMemo(() => new Vector3(), [])
	const targetRotation = useMemo(() => new Quaternion(), [])
	const steeringQuat = useMemo(() => new Quaternion(), [])
	const spinQuat = useMemo(() => new Quaternion(), [])

	// Get vehicle config with defaults
	const config = useMemo(
		() => ({
			...vehicleConfigs.defaults,
			...vehicleConfig,
		}),
		[vehicleConfig]
	)

	const { color, roughness, rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, tire_muddiness, spare, addons, lighting } = config

	// Get vehicle dimensions and wheel positions from shared hook
	const { validBody, vehicleData, isTracked, vehicleHeight, wheelPositions, physicsWheelPositions } = useVehicleDimensions(config)
	const wheelRefs = useMemo(() => wheelPositions.map(() => ({ current: null })), [wheelPositions])
	const physicsWheelRefs = useMemo(() => physicsWheelPositions.map((wheel) => wheelRefs[wheel.visualIndex]), [physicsWheelPositions, wheelRefs])

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
			targetPosition.fromArray(interpolated.position)
			currentPosition.current.lerp(targetPosition, INTERPOLATION_SMOOTHING)
			groupRef.current.position.copy(currentPosition.current)

			// Smoothly slerp to target rotation
			targetRotation.fromArray(interpolated.rotation)
			currentRotation.current.slerp(targetRotation, INTERPOLATION_SMOOTHING)
			groupRef.current.quaternion.copy(currentRotation.current)

			// Update front wheel steering
			const steering = interpolated.steering || 0
			currentSteering.current = MathUtils.lerp(currentSteering.current, steering, INTERPOLATION_SMOOTHING)

			// Update audio state for VehicleAudio
			currentAudioState.current.rpm = interpolated.engineRpm || 850
			currentAudioState.current.hornActive = interpolated.hornActive || false
			currentWheelRotations.current = interpolated.wheelRotations || []

			// Update physics wheel rotations, positions, and steering
			physicsWheelRefs.forEach((ref, i) => {
				if (!ref.current) return

				// Update wheel Y position for suspension movement
				if (interpolated.wheelYPositions && interpolated.wheelYPositions[i] !== undefined) {
					ref.current.position.y = interpolated.wheelYPositions[i]
				}

				// Apply wheel spin and steering using quaternion (matching physics behavior)
				const wheelSteering = physicsWheelPositions[i]?.steer ? currentSteering.current : 0
				const wheelSpin = interpolated.wheelRotations?.[i] || 0

				// Create quaternion from steering (Y axis) and spin (X axis)
				// This matches how the physics system applies wheel rotation
				steeringQuat.setFromAxisAngle(WHEEL_UP_AXIS, wheelSteering)
				spinQuat.setFromAxisAngle(WHEEL_AXLE_AXIS, wheelSpin)
				ref.current.quaternion.multiplyQuaternions(steeringQuat, spinQuat)
			})
		}
	})

	// Callback for VehicleAudio to get current audio state
	const getRemoteState = useMemo(
		() => () => currentAudioState.current,
		[]
	)

	return (
		<group ref={groupRef} name={`RemoteVehicle-${playerId}`}>
			<PlayerLabel name={playerName || 'Player'} />
			<VehicleAudio isRemote getRemoteState={getRemoteState} />
			<group name='VehicleBody'>
				<Suspense fallback={null}>
					<VehicleBody ref={bodyRef} key={validBody} id={validBody} height={vehicleHeight} color={color} roughness={roughness} addons={addons} lighting={lighting} />
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
					spare={spare}
					bodyId={validBody}
					bodyRef={bodyRef}
				/>
				{isTracked && (
					<TrackLinks
						trackConfig={vehicleData.track}
						wheelPositions={wheelPositions}
						wheelRefs={wheelRefs}
						physicsWheelPositions={physicsWheelPositions}
						wheelRotationsRef={currentWheelRotations}
					/>
				)}
			</group>
		</group>
	)
}

export default memo(RemoteVehicle)
