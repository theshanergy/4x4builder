import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, Quaternion } from 'three'
import { getRiverSpline } from '../utils/terrain/features/river/spline'
import { WATER_LEVEL, BUOYANCY_CONFIG, RIVER_CONFIG } from '../config/water'
import { vehicleState } from '../store/gameStore'

/**
 * Buoyancy hook for vehicle water physics
 * Automatically applies buoyancy forces each frame when vehicle is in water
 * @param {Object} vehicleRef - Reference to the vehicle rigid body
 */
const useBuoyancy = (vehicleRef) => {
	// Track water intake (0 = dry, 1 = full/sunk)
	const waterIntake = useRef(0)

	// Get river spline (single source of truth)
	const riverSpline = useMemo(() => getRiverSpline(), [])

	// Reusable vectors
	const vec = useMemo(() => new Vector3(), [])
	const vec2 = useMemo(() => new Vector3(), [])
	const quat = useMemo(() => new Quaternion(), [])

	// Apply buoyancy forces each frame
	useFrame((state, delta) => {
		const vehicle = vehicleRef.current
		if (!vehicle) return

		const vehiclePos = vehicle.translation()
		const submersionDepth = WATER_LEVEL - vehiclePos.y

		if (submersionDepth > 0) {
			vehicleState.isInWater = true

			// 1. Update water intake (sinking mechanic)
			waterIntake.current = Math.min(1, waterIntake.current + delta * BUOYANCY_CONFIG.sinkingRate)

			// 2. Calculate Buoyancy Force
			// F_buoyancy = Mass * Gravity * FloatFactor * SubmersionRatio
			const mass = vehicle.mass()
			const gravity = 9.81

			// Calculate effective buoyancy capability (decreases as it fills with water)
			// Interpolate between floatFactor and minBuoyancy based on waterIntake
			const currentFloatFactor = BUOYANCY_CONFIG.floatFactor * (1 - waterIntake.current) + BUOYANCY_CONFIG.minBuoyancy * waterIntake.current

			// Submersion ratio (0 to 1)
			const submersionRatio = Math.min(1, submersionDepth / BUOYANCY_CONFIG.maxDepth)

			// Total upward force magnitude
			const buoyancyForce = mass * gravity * currentFloatFactor * submersionRatio

			// Apply Buoyancy Force
			// Upward force vector (Impulse = Force * delta)
			const buoyancyImpulse = buoyancyForce * delta
			vec.set(0, buoyancyImpulse, 0)
			vehicle.applyImpulse(vec, true)

			// Apply rotational force (Torque) based on offset
			// Torque = r x F
			const rotation = vehicle.rotation()
			quat.copy(rotation)

			// Calculate offset vector in world space (relative to COM)
			vec2.set(0, 0, BUOYANCY_CONFIG.buoyancyOffset).applyQuaternion(quat)

			// Calculate torque (Cross product of offset and upward force)
			// F = (0, buoyancyImpulse, 0)
			// T = r x F = (-r.z * F.y, 0, r.x * F.y)
			vec.set(-vec2.z * buoyancyImpulse, 0, vec2.x * buoyancyImpulse)
			vehicle.applyTorqueImpulse(vec, true)

			// 3. Apply Water Resistance (Drag)
			// Drag force opposes velocity: F_drag = -c * v
			const linvel = vehicle.linvel()
			// Scale drag by mass so heavy vehicles don't stop instantly, but also by submersion
			// Using mass ensures consistent behavior regardless of vehicle weight
			const dragFactor = BUOYANCY_CONFIG.drag * mass * delta * submersionRatio

			vec.set(
				-linvel.x * dragFactor * 0.5, // X drag
				-linvel.y * dragFactor, // Y drag (higher resistance moving up/down)
				-linvel.z * dragFactor * 0.5 // Z drag
			)
			vehicle.applyImpulse(vec, true)

			// 4. Apply Angular Drag (Rotational Resistance)
			// Torque = -c * angular_velocity
			const angvel = vehicle.angvel()
			const angDragFactor = BUOYANCY_CONFIG.angularDrag * mass * delta * submersionRatio

			vec.set(-angvel.x * angDragFactor, -angvel.y * angDragFactor, -angvel.z * angDragFactor)
			vehicle.applyTorqueImpulse(vec, true)

			// 5. Apply Water Flow Forces (using river spline directly)
			// Get river data at vehicle position
			const { distance, riverData } = riverSpline.getDistanceToRiver(vehiclePos.x, vehiclePos.z)

			// Only apply flow forces if we're in the river bounds and underwater
			const halfWidth = riverData.width / 2
			const isInRiverBounds = distance < halfWidth

			if (isInRiverBounds && riverData.flowSpeed > 0.01) {
				// Calculate flow force magnitude
				// Force scales with: mass, submersion (depth), and flow speed
				const flowForceMagnitude = mass * BUOYANCY_CONFIG.flowForce * submersionRatio * riverData.flowSpeed * delta // Apply force in flow direction
				const flowDir = riverData.direction
				vec.set(flowDir.x * flowForceMagnitude, 0, flowDir.z * flowForceMagnitude)
				vehicle.applyImpulse(vec, true)

				// Apply slight torque to align with flow (makes vehicle want to point downstream)
				const rotation = vehicle.rotation()
				quat.copy(rotation)

				// Get vehicle's forward direction
				vec2.set(0, 0, 1).applyQuaternion(quat)

				// Calculate cross product between forward direction and flow direction
				// This creates a torque that rotates the vehicle toward the flow direction
				const flowDirVec = new Vector3(flowDir.x, 0, flowDir.z).normalize()
				const alignTorque = vec2.clone().cross(flowDirVec)

				// Scale torque by flow strength and apply it
				const torqueMagnitude = mass * riverData.flowSpeed * 0.5 * delta
				alignTorque.multiplyScalar(torqueMagnitude)

				vec.set(alignTorque.x, alignTorque.y, alignTorque.z)
				vehicle.applyTorqueImpulse(vec, true)
			}
		} else {
			vehicleState.isInWater = false
			// Drain water slowly when out of water
			waterIntake.current = Math.max(0, waterIntake.current - delta * 0.2)
		}
	})
}

export default useBuoyancy
