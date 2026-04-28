import { memo, useMemo, useRef, useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'

import vehicleConfigs from '../../../config/vehicles'
import Wheel from './Wheel'

// Wheels - container component that positions wheel groups (including spare wheel)
const Wheels = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, tire_muddiness, color, roughness, wheelPositions, wheelRefs, wheelVisualRefs, spare, bodyId, bodyRef }) => {
	const spareWheelRef = useRef()

	// Get spare wheel position from vehicle config
	const spareWheelConfig = vehicleConfigs.vehicles[bodyId]?.spare_wheel

	// Calculate rim width in meters (convert from inches)
	const rimWidthMeters = (rim_width * 2.54) / 100

	// Store the base Y offset from vehicle config (relative to body origin)
	const baseYOffset = useMemo(() => {
		return spareWheelConfig?.[1] || 0
	}, [spareWheelConfig])

	// Combine regular wheel positions with optional spare wheel
	const allWheelPositions = useMemo(() => {
		const positions = [...wheelPositions]
		if (spare && spareWheelConfig) {
			positions.push({
				key: 'spare',
				position: [spareWheelConfig[0], 0, spareWheelConfig[2] - rimWidthMeters / 2],
				rotation: [0, Math.PI, 0],
				isSpare: true,
				baseYOffset: spareWheelConfig[1]
			})
		}
		return positions
	}, [wheelPositions, spare, spareWheelConfig, rimWidthMeters])

	// Sync Y position when body ref or config changes
	useLayoutEffect(() => {
		if (!spareWheelRef.current || !bodyRef?.current) return
		spareWheelRef.current.position.y = bodyRef.current.position.y + baseYOffset
	}, [bodyRef, baseYOffset, bodyId])

	// Sync Y position from body (with config offset) every frame to track animations
	useFrame(() => {
		if (!spareWheelRef.current || !bodyRef?.current) return
		spareWheelRef.current.position.y = bodyRef.current.position.y + baseYOffset
	})

	return (
		<group name='Wheels'>
			{allWheelPositions.map(({ key, rotation, isSpare, ...transform }, index) => (
				<group key={key} ref={isSpare ? spareWheelRef : wheelRefs[index]} {...transform}>
					<group ref={isSpare ? null : wheelVisualRefs?.[index]}>
						{/* Add an inner group with the correct visual rotation */}
						<group rotation={rotation}>
							<Wheel
								rim={rim}
								rim_diameter={rim_diameter}
								rim_width={rim_width}
								rim_color={rim_color}
								rim_color_secondary={rim_color_secondary}
								tire={tire}
								tire_diameter={tire_diameter}
								tire_muddiness={isSpare ? 0 : tire_muddiness}
								color={color}
								roughness={roughness}
							/>
						</group>
					</group>
				</group>
			))}
		</group>
	)
})

export default Wheels
