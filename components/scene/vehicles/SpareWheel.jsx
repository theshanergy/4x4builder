import { memo, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import vehicleConfigs from '../../../vehicleConfigs'
import Wheel from './Wheel'

// SpareWheel - renders a spare wheel at the position defined in vehicle config
const SpareWheel = memo(({ bodyId, spare, bodyRef, rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, color, roughness }) => {
	const groupRef = useRef()

	// Get spare wheel position from vehicle config
	const spareWheelConfig = vehicleConfigs.vehicles[bodyId]?.spare_wheel

	// Calculate rim width in meters (convert from inches)
	const rimWidthMeters = (rim_width * 2.54) / 100

	// Store the base Y offset from vehicle config (relative to body origin)
	const baseYOffset = useMemo(() => {
		return spareWheelConfig?.[1] || 0
	}, [spareWheelConfig])

	// Calculate final position with offsets:
	// - Add half rim width to Z to prevent clipping into body
	// - Y position will be updated in useFrame to track body + offset
	const position = useMemo(() => {
		if (!spareWheelConfig) return [0, 0, 0]
		return [spareWheelConfig[0], spareWheelConfig[1], spareWheelConfig[2] - rimWidthMeters / 2]
	}, [spareWheelConfig, rimWidthMeters])

	// Rotate 180 degrees around Y axis to face outward (toward rear of vehicle)
	const rotation = useMemo(() => [0, Math.PI, 0], [])

	// Sync Y position directly from body (with config offset) to avoid any desync
	useFrame(() => {
		if (!groupRef.current || !bodyRef?.current) return
		groupRef.current.position.y = bodyRef.current.position.y + baseYOffset
	})

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
