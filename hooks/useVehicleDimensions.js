import { useMemo } from 'react'
import vehicleConfigs from '../config/vehicles'

// Constant rotation value (90 degrees in radians)
const WHEEL_ROTATION = (Math.PI * 90) / 180
const VEHICLE_CLASS_TRACKED = 'tracked'
const DEFAULT_TRACK_DEPTH = 0.08

const inchesToMeters = (inches) => (inches * 2.54) / 100

const normalizeTrackWheelPosition = (position = [0, 0, 0]) => {
	if (position.length === 2) {
		return [0, position[0], position[1]]
	}
	return [position[0] || 0, position[1] || 0, position[2] || 0]
}

const getTrackWheelRimRadius = (wheel, fallbackRimDiameter) => inchesToMeters(wheel.rim_diameter || fallbackRimDiameter) / 2

/**
 * Hook to calculate common vehicle dimensions and wheel positions
 * Shared between Vehicle and RemoteVehicle components
 */
const useVehicleDimensions = (config) => {
	const { body, tire_diameter, lift, wheel_offset, rim_diameter, rim_width } = config

	// Validate vehicle body exists
	const validBody = vehicleConfigs.vehicles[body] ? body : vehicleConfigs.defaults.body
	const vehicleData = vehicleConfigs.vehicles[validBody]
	const vehicleClass = vehicleData.vehicle_class || 'wheeled'
	const isTracked = vehicleClass === VEHICLE_CLASS_TRACKED
	const trackConfig = isTracked ? vehicleData.track : null
	const trackDepth = isTracked ? trackConfig?.track_depth ?? trackConfig?.link_height ?? DEFAULT_TRACK_DEPTH : 0
	const trackGroundOffset = useMemo(() => {
		if (!isTracked) return 0

		const wheels = trackConfig?.wheels || []
		if (wheels.length === 0) return 0

		const minGroundY = Math.min(
			...wheels.map((wheel) => {
				const [, y] = normalizeTrackWheelPosition(wheel.position)
				return y - getTrackWheelRimRadius(wheel, rim_diameter) - trackDepth
			})
		)

		return minGroundY < 0 ? -minGroundY : 0
	}, [isTracked, trackConfig, rim_diameter, trackDepth])

	// Get wheel (axle) height - tire radius
	const axleHeight = useMemo(() => {
		if (!isTracked) {
			return inchesToMeters(tire_diameter) / 2
		}

		const physicsWheelRadii = (trackConfig?.wheels || []).filter((wheel) => wheel.physics === true).map((wheel) => getTrackWheelRimRadius(wheel, rim_diameter) + trackDepth)
		return physicsWheelRadii.length > 0 ? Math.max(...physicsWheelRadii) : inchesToMeters(rim_diameter) / 2 + trackDepth
	}, [isTracked, tire_diameter, trackConfig, rim_diameter, trackDepth])

	// Get lift height in meters
	const liftHeight = useMemo(() => ((lift || 0) * 2.54) / 100, [lift])

	// Get vehicle height (axle + lift)
	const vehicleHeight = useMemo(() => (trackConfig?.body_height ?? axleHeight) + liftHeight + trackGroundOffset, [trackConfig, axleHeight, liftHeight, trackGroundOffset])

	// Memoize wheel offset calculation
	const offset = useMemo(
		() => vehicleData.wheel_offset + parseFloat(wheel_offset || 0),
		[vehicleData.wheel_offset, wheel_offset]
	)

	// Get wheelbase from vehicle config, or derive a chassis length from tracked wheel extents.
	const wheelbase = useMemo(() => {
		if (!isTracked) {
			return vehicleData.wheelbase
		}

		const zPositions = (trackConfig?.wheels || []).map((wheel) => normalizeTrackWheelPosition(wheel.position)[2])
		if (zPositions.length === 0) {
			return vehicleData.wheelbase || vehicleConfigs.vehicles[vehicleConfigs.defaults.body].wheelbase
		}

		const trackLength = Math.max(...zPositions.map((z) => Math.abs(z))) * 2
		return Math.max(trackLength, 1)
	}, [isTracked, vehicleData.wheelbase, trackConfig])

	// Set wheel positions
	const wheelPositions = useMemo(() => {
		if (!isTracked) {
			return [
				{ key: 'FL', name: 'FL', position: [offset, axleHeight, wheelbase / 2], rotation: [0, WHEEL_ROTATION, 0], physics: true, radius: axleHeight, steer: true, driveFactor: 0.4, frictionRole: 'front', visualIndex: 0 },
				{ key: 'FR', name: 'FR', position: [-offset, axleHeight, wheelbase / 2], rotation: [0, -WHEEL_ROTATION, 0], physics: true, radius: axleHeight, steer: true, driveFactor: 0.4, frictionRole: 'front', visualIndex: 1 },
				{ key: 'RL', name: 'RL', position: [offset, axleHeight, -wheelbase / 2], rotation: [0, WHEEL_ROTATION, 0], physics: true, radius: axleHeight, steer: false, driveFactor: 0.6, frictionRole: 'rear', visualIndex: 2 },
				{ key: 'RR', name: 'RR', position: [-offset, axleHeight, -wheelbase / 2], rotation: [0, -WHEEL_ROTATION, 0], physics: true, radius: axleHeight, steer: false, driveFactor: 0.6, frictionRole: 'rear', visualIndex: 3 },
			]
		}

		const positions = []
		for (const [index, wheel] of (trackConfig?.wheels || []).entries()) {
			const [x, y, z] = normalizeTrackWheelPosition(wheel.position)
			const rimRadius = getTrackWheelRimRadius(wheel, rim_diameter)
			const physicsRadius = rimRadius + trackDepth

			for (const side of ['L', 'R']) {
				const sideSign = side === 'L' ? 1 : -1
				const visualIndex = positions.length
				positions.push({
					key: `${wheel.key || `track_wheel_${index}`}_${side}`,
					name: `${wheel.name || wheel.key || `Track Wheel ${index + 1}`} ${side}`,
					position: [sideSign * (offset + x), y + trackGroundOffset, z],
					rotation: [0, sideSign * WHEEL_ROTATION, 0],
					physics: wheel.physics === true,
					radius: rimRadius,
					physicsRadius,
					side,
					sideSign,
					trackWheelIndex: index,
					rim: wheel.rim,
					rim_diameter: wheel.rim_diameter,
					rim_width: wheel.rim_width,
					showTire: false,
					isTrackWheel: true,
					differentialSteering: true,
					steer: wheel.steer === true,
					driveFactor: wheel.driveFactor,
					frictionRole: wheel.frictionRole || 'track',
					visualIndex,
				})
			}
		}

		const physicsCount = positions.filter((wheel) => wheel.physics).length
		return positions.map((wheel) => ({
			...wheel,
			rim_diameter: wheel.rim_diameter || rim_diameter,
			rim_width: wheel.rim_width || rim_width,
			driveFactor: wheel.physics ? wheel.driveFactor ?? 2 / Math.max(physicsCount, 1) : 0,
			brakeFactor: wheel.physics ? wheel.brakeFactor ?? 3 / Math.max(physicsCount, 1) : 0,
		}))
	}, [isTracked, offset, axleHeight, wheelbase, trackConfig, rim_diameter, rim_width, trackDepth, trackGroundOffset])

	const physicsWheelPositions = useMemo(() => wheelPositions.filter((wheel) => wheel.physics), [wheelPositions])

	return {
		validBody,
		vehicleData,
		vehicleClass,
		isTracked,
		axleHeight,
		liftHeight,
		trackGroundOffset,
		vehicleHeight,
		offset,
		wheelbase,
		wheelPositions,
		physicsWheelPositions,
	}
}

export default useVehicleDimensions
