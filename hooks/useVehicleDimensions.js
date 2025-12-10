import { useMemo } from 'react'
import vehicleConfigs from '../vehicleConfigs'

// Constant rotation value (90 degrees in radians)
const WHEEL_ROTATION = (Math.PI * 90) / 180

/**
 * Hook to calculate common vehicle dimensions and wheel positions
 * Shared between Vehicle and RemoteVehicle components
 */
const useVehicleDimensions = (config) => {
	const { body, tire_diameter, lift, wheel_offset } = config

	// Validate vehicle body exists
	const validBody = vehicleConfigs.vehicles[body] ? body : vehicleConfigs.defaults.body
	const vehicleData = vehicleConfigs.vehicles[validBody]

	// Get wheel (axle) height - tire radius
	const axleHeight = useMemo(() => (tire_diameter * 2.54) / 100 / 2, [tire_diameter])

	// Get lift height in meters
	const liftHeight = useMemo(() => ((lift || 0) * 2.54) / 100, [lift])

	// Get vehicle height (axle + lift)
	const vehicleHeight = useMemo(() => axleHeight + liftHeight, [axleHeight, liftHeight])

	// Memoize wheel offset calculation
	const offset = useMemo(
		() => vehicleData.wheel_offset + parseFloat(wheel_offset || 0),
		[vehicleData.wheel_offset, wheel_offset]
	)

	// Get wheelbase from vehicle config (stable reference)
	const wheelbase = vehicleData.wheelbase

	// Set wheel positions
	const wheelPositions = useMemo(
		() => [
			{ key: 'FL', name: 'FL', position: [offset, axleHeight, wheelbase / 2], rotation: [0, WHEEL_ROTATION, 0] },
			{ key: 'FR', name: 'FR', position: [-offset, axleHeight, wheelbase / 2], rotation: [0, -WHEEL_ROTATION, 0] },
			{ key: 'RL', name: 'RL', position: [offset, axleHeight, -wheelbase / 2], rotation: [0, WHEEL_ROTATION, 0] },
			{ key: 'RR', name: 'RR', position: [-offset, axleHeight, -wheelbase / 2], rotation: [0, -WHEEL_ROTATION, 0] },
		],
		[offset, axleHeight, wheelbase]
	)

	return {
		validBody,
		vehicleData,
		axleHeight,
		liftHeight,
		vehicleHeight,
		offset,
		wheelbase,
		wheelPositions,
	}
}

export default useVehicleDimensions
