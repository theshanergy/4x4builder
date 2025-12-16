import { memo, useMemo } from 'react'
import useGameStore from '../../../store/gameStore'
import vehicleConfigs from '../../../vehicleConfigs'
import LightBar from './LightBar'

const mirrorPosition = (pos) => [-pos[0], pos[1], pos[2]]
const mirrorRotation = (rot) => [rot[0], -rot[1], rot[2]]

const Lighting = memo(({ id, lighting, addons }) => {
	const lightsOn = useGameStore((state) => state.lightsOn)
	const vehicleConfig = vehicleConfigs.vehicles[id]
	const lightingConfig = vehicleConfig?.lighting || {}

	const lightsToRender = useMemo(() => {
		const lights = []

		// Helper to process lighting configs
		const processLightingConfig = (config, lightType, keyPrefix, index) => {
			const baseKey = `${keyPrefix}_${lightType}_${index}`

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
		}

		// Process vehicle lighting
		for (const [lightType, configs] of Object.entries(lightingConfig)) {
			if (!configs) continue

			configs.forEach((config, index) => {
				if (!lighting?.[lightType]?.[index]) return
				processLightingConfig(config, lightType, 'vehicle', index)
			})
		}

		// Process addon lighting
		if (addons && vehicleConfig?.addons) {
			Object.entries(addons).forEach(([addonType, addonValue]) => {
				const addonOption = vehicleConfig.addons[addonType]?.options?.[addonValue]
				if (!addonOption?.lighting) return

				for (const [lightType, configs] of Object.entries(addonOption.lighting)) {
					if (!configs) continue
					configs.forEach((config, index) => {
						processLightingConfig(config, lightType, `addon_${addonType}_${addonValue}`, index)
					})
				}
			})
		}

		return lights
	}, [lightingConfig, lighting, addons, vehicleConfig])

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
