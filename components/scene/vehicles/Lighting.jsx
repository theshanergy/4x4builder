import { memo, useMemo } from 'react'
import useGameStore from '../../../store/gameStore'
import vehicleConfigs from '../../../vehicleConfigs'
import LightBar from './LightBar'

const mirrorPosition = (pos) => [-pos[0], pos[1], pos[2]]
const mirrorRotation = (rot) => [rot[0], -rot[1], rot[2]]

const Lighting = memo(({ id, lighting }) => {
	const lightsOn = useGameStore((state) => state.lightsOn)
	const lightingConfig = vehicleConfigs.vehicles[id]?.lighting || {}

	const lightsToRender = useMemo(() => {
		const lights = []

		for (const [lightType, configs] of Object.entries(lightingConfig)) {
			if (!configs) continue

			configs.forEach((config, index) => {
				if (!lighting?.[lightType]?.[index]) return

				const baseKey = `${lightType}_${index}`

				// Add right/main light
				lights.push({
					type: lightType,
					key: `${baseKey}_right`,
					...config,
					position: config.position,
					rotation: config.rotation,
				})

				// Add mirrored left light if paired
				if (config.pair) {
					lights.push({
						type: lightType,
						key: `${baseKey}_left`,
						...config,
						position: mirrorPosition(config.position),
						rotation: mirrorRotation(config.rotation),
					})
				}
			})
		}

		return lights
	}, [lightingConfig, lighting])

	if (!lightsToRender.length) return null

	return (
		<group name='Lighting'>
			{lightsToRender.map((light) => {
				if (light.type === 'lightbar') {
					return (
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
					)
				}
				return null
			})}
		</group>
	)
})

export default Lighting
