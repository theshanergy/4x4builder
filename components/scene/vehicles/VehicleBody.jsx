import { memo, useMemo, useRef, useLayoutEffect, Suspense } from 'react'
import { useGLTF } from '@react-three/drei'

import vehicleConfigs from '../../../vehicleConfigs'
import useAnimateHeight from '../../../hooks/useAnimateHeight'
import useMaterialProperties from '../../../hooks/useMaterialProperties'
import cloneWithMaterials from '../../../utils/cloneWithMaterials'
import Lighting from './Lighting'

// Single addon component - loads and applies materials before first render
const Addon = memo(({ path, color, roughness }) => {
	const { setObjectMaterials } = useMaterialProperties()
	const gltf = useGLTF(path)

	// Clone scene once (only depends on gltf.scene)
	const scene = useMemo(() => cloneWithMaterials(gltf.scene), [gltf.scene])

	// Apply materials synchronously before paint to avoid flash
	useLayoutEffect(() => {
		setObjectMaterials(scene, color, roughness)
	}, [scene, setObjectMaterials, color, roughness])

	return <primitive object={scene} />
})

// Shared vehicle body component used by both local and remote vehicles
const VehicleBody = memo(({ id, height, color, roughness, addons, lighting }) => {
	const vehicle = useRef()
	const { setObjectMaterials } = useMaterialProperties()

	// Check if vehicle config exists
	const vehicleConfig = vehicleConfigs.vehicles[id]
	if (!vehicleConfig) {
		console.warn(`Unknown vehicle body: ${id}`)
		return null
	}

	// Load body model
	const bodyGltf = useGLTF(vehicleConfig.model)

	// Clone scene once (only depends on gltf.scene)
	const bodyScene = useMemo(() => cloneWithMaterials(bodyGltf.scene), [bodyGltf.scene])

	// Apply materials synchronously before paint to avoid flash
	useLayoutEffect(() => {
		setObjectMaterials(bodyScene, color, roughness)
	}, [bodyScene, setObjectMaterials, color, roughness])

	// Build array of addon paths
	const addonPaths = useMemo(() => {
		return Object.entries(addons || {})
			.filter(([type, value]) => vehicleConfig['addons']?.[type]?.['options']?.[value])
			.map(([type, value]) => vehicleConfig['addons'][type]['options'][value]['model'])
	}, [vehicleConfig, addons])

	// Animate height
	useAnimateHeight(vehicle, height, height + 0.1)

	return (
		<group ref={vehicle} name='Body' key={id}>
			<primitive object={bodyScene} />
			{addonPaths.length > 0 && (
				<group name='Addons'>
					{addonPaths.map((path) => (
						<Suspense key={path} fallback={null}>
							<Addon path={path} color={color} roughness={roughness} />
						</Suspense>
					))}
				</group>
			)}
			{lighting && <Lighting id={id} lighting={lighting} />}
		</group>
	)
})

export default VehicleBody
