import { memo, useMemo } from 'react'
import useGameStore from '../../../store/gameStore'
import vehicleConfigs from '../../../vehicleConfigs'
import LightBar from './LightBar'

const Lighting = memo(({ id, lighting }) => {
	const lightsOn = useGameStore((state) => state.lightsOn)

	// Get lighting config for this vehicle
	const lightingConfig = vehicleConfigs.vehicles[id]?.lighting || {}

	// Build array of lights to render (handles pair mirroring)
	const lightsToRender = useMemo(() => {
		const lights = []
		Object.entries(lightingConfig).forEach(([key, light]) => {
			// Check if this light is enabled in the lighting prop
			const isEnabled = lighting?.[key] === true
			if (!isEnabled) return

			// Merge with any overrides from lighting prop
			const lightConfig = { ...light }

			if (lightConfig.pair) {
				// Create right side light
				lights.push({
					key: `${key}_right`,
					width: lightConfig.width,
					rows: lightConfig.rows,
					color: lightConfig.color,
					position: lightConfig.position,
					rotation: lightConfig.rotation,
				})
				// Create left side light (mirror X position and Y rotation)
				lights.push({
					key: `${key}_left`,
					width: lightConfig.width,
					rows: lightConfig.rows,
					color: lightConfig.color,
					position: [-lightConfig.position[0], lightConfig.position[1], lightConfig.position[2]],
					rotation: [lightConfig.rotation[0], -lightConfig.rotation[1], lightConfig.rotation[2]],
				})
			} else {
				// Single light
				lights.push({
					key,
					width: lightConfig.width,
					rows: lightConfig.rows,
					color: lightConfig.color,
					position: lightConfig.position,
					rotation: lightConfig.rotation,
				})
			}
		})
		return lights
	}, [lightingConfig, lighting])

	if (lightsToRender.length === 0) return null

	return (
		<group name='Lighting'>
			{lightsToRender.map((light) => (
				<LightBar
					key={light.key}
					width={light.width}
					rows={light.rows}
					color={light.color}
					intensity={lightsOn ? 1 : 0}
					position={light.position}
					rotation={light.rotation}
				/>
			))}
		</group>
	)
})

export default Lighting
