import { memo, useMemo } from 'react'
import useGameStore from '../../../store/gameStore'
import vehicleConfigs from '../../../vehicleConfigs'
import LightBar from './LightBar'

const Lighting = memo(({ id, lighting }) => {
	const lightsOn = useGameStore((state) => state.lightsOn)
	const lightingConfig = vehicleConfigs.vehicles[id]?.lighting || {}

	const lightsToRender = useMemo(() => {
		return Object.entries(lightingConfig).flatMap(([key, light]) => {
			if (!lighting?.[key]) return []

			const createLight = (key, pos, rot) => ({
				key,
				width: light.width,
				rows: light.rows,
				color: light.color,
				position: pos,
				rotation: rot,
				curvature: light.curvature,
			})

			if (light.pair) {
				return [
					createLight(`${key}_right`, light.position, light.rotation),
					createLight(`${key}_left`, [-light.position[0], light.position[1], light.position[2]], [light.rotation[0], -light.rotation[1], light.rotation[2]]),
				]
			}
			return [createLight(key, light.position, light.rotation)]
		})
	}, [id, lighting])

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
					curvature={light.curvature}
				/>
			))}
		</group>
	)
})

export default Lighting
