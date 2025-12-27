import { memo, useMemo, useRef } from 'react'

import vehicleConfigs from '../../../vehicleConfigs'
import useAnimateHeight from '../../../hooks/useAnimateHeight'
import Wheel from './Wheel'

// SpareWheel - renders a spare wheel at the position defined in vehicle config
const SpareWheel = memo(({ bodyId, spare, height = 0, rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, color, roughness }) => {
	const groupRef = useRef()

	// Get spare wheel position from vehicle config
	const spareWheelConfig = vehicleConfigs.vehicles[bodyId]?.spare_wheel

	// Calculate rim width in meters (convert from inches)
	const rimWidthMeters = (rim_width * 2.54) / 100

	// Calculate target Y position: base config position + lift height
	const baseY = spareWheelConfig?.[1] || 0
	const targetY = baseY + height

	// Calculate final position with offsets:
	// - Add half rim width to Z to prevent clipping into body
	// - Y position is animated by useAnimateHeight, so we only set X and Z here
	const position = useMemo(() => {
		if (!spareWheelConfig) return [0, 0, 0]
		return [
			spareWheelConfig[0],
			spareWheelConfig[1],
			spareWheelConfig[2] - rimWidthMeters / 2
		]
	}, [spareWheelConfig, rimWidthMeters])

	// Rotate 180 degrees around Y axis to face outward (toward rear of vehicle)
	const rotation = useMemo(() => [0, Math.PI, 0], [])

	// Animate height to match body animation (same start offset as VehicleBody)
	useAnimateHeight(groupRef, targetY, targetY + 0.1)

	// Don't render if spare is not enabled or no position defined
	if (!spare || !spareWheelConfig) return null

	return (
		<group ref={groupRef} name='SpareWheel' position={position} rotation={rotation}>
			<axesHelper args={[0.5]} />
			<Wheel
				rim={rim}
				rim_diameter={rim_diameter}
				rim_width={rim_width}
				rim_color={rim_color}
				rim_color_secondary={rim_color_secondary}
				tire={tire}
				tire_diameter={tire_diameter}
				tire_muddiness={0}
				color={color}
				roughness={roughness}
				cloneMaterials={true}
			/>
		</group>
	)
})

export default SpareWheel
