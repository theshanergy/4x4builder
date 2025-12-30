import { useRef, useMemo } from 'react'
import { Vector3, Quaternion } from 'three'
import { generateFlowMap, FLOW_MAP_CONFIG } from '../components/scene/environment/terrain/flowMapGenerator'

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

	// Flow parameters
	flowForce: 8.0, // Multiplier for flow force strength
}

/**
 * Sample flow data from the flow map at a given world position
 * @param {Object} flowMapData - The flow map data object
 * @param {number} worldX - World X position
 * @param {number} worldZ - World Z position
 * @returns {Object} - Flow data { dirX, dirZ, speed, inRiver }
 */
const sampleFlowMap = (flowMapData, worldX, worldZ) => {
	if (!flowMapData) {
		return { dirX: 0, dirZ: 0, speed: 0, inRiver: 0 }
	}

	const { data, resolution, worldSize } = flowMapData
	const halfSize = worldSize / 2

	// Convert world coords to texture coords
	const u = (worldX + halfSize) / worldSize
	const v = (worldZ + halfSize) / worldSize

	// Clamp to texture bounds
	const ux = Math.max(0, Math.min(0.999, u))
	const vx = Math.max(0, Math.min(0.999, v))

	// Get pixel coordinates
	const px = Math.floor(ux * resolution)
	const py = Math.floor(vx * resolution)
	const idx = (py * resolution + px) * 4

	// Decode flow data from texture
	const flowX = (data[idx + 0] / 255) * 2 - 1 // Convert 0-255 to -1 to 1
	const flowZ = (data[idx + 1] / 255) * 2 - 1
	const speed = data[idx + 2] / 255 // 0-1
	const inRiver = data[idx + 3] / 255 // 0-1

	return { dirX: flowX, dirZ: flowZ, speed, inRiver }
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

	// Generate and cache flow map data
	const flowMapData = useMemo(() => {
		const flowMap = generateFlowMap(FLOW_MAP_CONFIG.resolution, FLOW_MAP_CONFIG.worldSize)
		return {
			data: flowMap.image.data,
			resolution: FLOW_MAP_CONFIG.resolution,
			worldSize: FLOW_MAP_CONFIG.worldSize,
		}
	}, [])

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

			// 5. Apply Water Flow Forces
			// Sample flow map at vehicle position
			const flow = sampleFlowMap(flowMapData, vehiclePos.x, vehiclePos.z)

			if (flow.speed > 0.01 && flow.inRiver > 0.01) {
				// Calculate flow force magnitude
				// Force scales with: mass (heavier = more force), submersion, flow speed, and river presence
				const flowForceMagnitude = mass * BUOYANCY.flowForce * submersionRatio * flow.speed * flow.inRiver * delta

				// Apply force in flow direction
				vec.set(flow.dirX * flowForceMagnitude, 0, flow.dirZ * flowForceMagnitude)
				vehicle.applyImpulse(vec, true)

				// Optional: Apply slight torque to align with flow (makes vehicle want to point downstream)
				const rotation = vehicle.rotation()
				quat.copy(rotation)

				// Get vehicle's forward direction
				vec2.set(0, 0, 1).applyQuaternion(quat)

				// Calculate cross product between forward direction and flow direction
				// This creates a torque that rotates the vehicle toward the flow direction
				const flowDir = new Vector3(flow.dirX, 0, flow.dirZ).normalize()
				const alignTorque = vec2.clone().cross(flowDir)

				// Scale torque by flow strength and apply it
				const torqueMagnitude = mass * flow.speed * flow.inRiver * 0.5 * delta
				alignTorque.multiplyScalar(torqueMagnitude)

				vec.set(alignTorque.x, alignTorque.y, alignTorque.z)
				vehicle.applyTorqueImpulse(vec, true)
			}

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
