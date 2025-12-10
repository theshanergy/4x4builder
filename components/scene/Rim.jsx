import { memo, useMemo, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'

import vehicleConfigs from '../../vehicleConfigs'
import useMaterialProperties from '../../hooks/useMaterialProperties'
import cloneWithMaterials from '../../utils/cloneWithMaterials'

// Rim component - loads and renders a single rim
const Rim = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, color, roughness, cloneMaterials = false }) => {
	const { setObjectMaterials } = useMaterialProperties()

	// Load rim model
	const rimGltf = useGLTF(vehicleConfigs.wheels.rims[rim].model)

	// Clone rim scene (optionally with unique materials for remote vehicles)
	const rimScene = useMemo(
		() => (cloneMaterials ? cloneWithMaterials(rimGltf.scene) : rimGltf.scene.clone()),
		[rimGltf.scene, cloneMaterials]
	)

	// Calculate rim scale as a percentage of diameter
	const odScale = useMemo(
		() => ((rim_diameter * 2.54) / 100 + 0.03175) / vehicleConfigs.wheels.rims[rim].od,
		[rim, rim_diameter]
	)

	// Calculate rim width
	const widthScale = useMemo(
		() => (rim_width * 2.54) / 100 / vehicleConfigs.wheels.rims[rim].width,
		[rim, rim_width]
	)

	// Set rim color
	useEffect(() => {
		setObjectMaterials(rimScene, color, roughness, rim_color, rim_color_secondary)
	}, [rimScene, setObjectMaterials, rim_color, rim_color_secondary, color, roughness])

	return <primitive name='Rim' object={rimScene} scale={[odScale, odScale, widthScale]} />
})

export default Rim
