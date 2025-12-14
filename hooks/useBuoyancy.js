import { useRef, useMemo } from 'react'
import { Vector3, Quaternion } from 'three'

// Water level constant
const WATER_LEVEL = -1

// Buoyancy configuration
const BUOYANCY = {
	// Physics parameters
	floatFactor: 1.1, // Multiplier of gravity to determine max buoyancy (1.1 = slightly buoyant)
	drag: 4.0, // Linear drag coefficient (water resistance)
	angularDrag: 6.0, // Angular drag coefficient (rotational resistance)

	// Geometry parameters
	maxDepth: 1.1, // Depth for full buoyancy (approx vehicle height)
	buoyancyOffset: -0.1, // Offset behind center (negative Z) to make nose dip

	// Sinking parameters
	sinkingRate: 0.05, // How fast it fills with water (0-1 per second)
	minBuoyancy: 0.1, // Buoyancy factor when fully sunk (still has some displacement)
}

/**
 * Buoyancy hook for vehicle water physics
 * @param {Object} vehicleRef - Reference to the vehicle rigid body
 * @returns {Object} - Buoyancy state and update function
 */
export const useBuoyancy = (vehicleRef) => {
	// Track if vehicle is in water
	const isInWater = useRef(false)
	// Track water intake (0 = dry, 1 = full/sunk)
	const waterIntake = useRef(0)

	// Reusable vectors
	const vec = useMemo(() => new Vector3(), [])
	const vec2 = useMemo(() => new Vector3(), [])
	const quat = useMemo(() => new Quaternion(), [])

	/**
	 * Apply buoyancy forces to the vehicle
	 * @param {number} delta - Frame delta time
	 * @returns {boolean} - Whether the vehicle is in water
	 */
	const applyBuoyancy = (delta) => {
		const vehicle = vehicleRef.current
		if (!vehicle) return false

		const vehiclePos = vehicle.translation()
		const submersionDepth = WATER_LEVEL - vehiclePos.y

		if (submersionDepth > 0) {
			isInWater.current = true

			// 1. Update water intake (sinking mechanic)
			waterIntake.current = Math.min(1, waterIntake.current + delta * BUOYANCY.sinkingRate)

			// 2. Calculate Buoyancy Force
			// F_buoyancy = Mass * Gravity * FloatFactor * SubmersionRatio
			const mass = vehicle.mass()
			const gravity = 9.81

			// Calculate effective buoyancy capability (decreases as it fills with water)
			// Interpolate between floatFactor and minBuoyancy based on waterIntake
			const currentFloatFactor = BUOYANCY.floatFactor * (1 - waterIntake.current) + BUOYANCY.minBuoyancy * waterIntake.current

			// Submersion ratio (0 to 1)
			const submersionRatio = Math.min(1, submersionDepth / BUOYANCY.maxDepth)

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
			vec2.set(0, 0, BUOYANCY.buoyancyOffset).applyQuaternion(quat)

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
			const dragFactor = BUOYANCY.drag * mass * delta * submersionRatio

			vec.set(
				-linvel.x * dragFactor * 0.5, // X drag
				-linvel.y * dragFactor, // Y drag (higher resistance moving up/down)
				-linvel.z * dragFactor * 0.5 // Z drag
			)
			vehicle.applyImpulse(vec, true)

			// 4. Apply Angular Drag (Rotational Resistance)
			// Torque = -c * angular_velocity
			const angvel = vehicle.angvel()
			const angDragFactor = BUOYANCY.angularDrag * mass * delta * submersionRatio

			vec.set(-angvel.x * angDragFactor, -angvel.y * angDragFactor, -angvel.z * angDragFactor)
			vehicle.applyTorqueImpulse(vec, true)

			return true
		} else {
			isInWater.current = false
			// Drain water slowly when out of water
			waterIntake.current = Math.max(0, waterIntake.current - delta * 0.2)
			return false
		}
	}

	return {
		isInWater,
		applyBuoyancy,
	}
}

export default useBuoyancy
