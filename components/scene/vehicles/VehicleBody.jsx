import { memo, useMemo, useRef, useLayoutEffect, Suspense, forwardRef } from 'react'
import { useGLTF } from '@react-three/drei'

import vehicleConfigs from '../../../vehicleConfigs'
import useAnimateHeight from '../../../hooks/useAnimateHeight'
import useMaterialProperties from '../../../hooks/useMaterialProperties'
import cloneWithMaterials from '../../../utils/cloneWithMaterials'
import Lighting from './Lighting'

// Default position to avoid creating new arrays on each render
const DEFAULT_POSITION = [0, 0, 0]

// Single addon component - loads and applies materials before first render
const Addon = memo(({ path, color, roughness, position }) => {
	const { setObjectMaterials } = useMaterialProperties()
	const gltf = useGLTF(path)

	// Clone scene once (only depends on gltf.scene)
	const scene = useMemo(() => cloneWithMaterials(gltf.scene), [gltf.scene])

	// Apply materials synchronously before paint to avoid flash
	useLayoutEffect(() => {
		setObjectMaterials(scene, color, roughness)
	}, [scene, setObjectMaterials, color, roughness])

	return <primitive object={scene} position={position || DEFAULT_POSITION} />
})

// Shared vehicle body component used by both local and remote vehicles
const VehicleBody = forwardRef(({ id, height, color, roughness, addons, lighting }, ref) => {
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

	// Memoize the set of replaceable meshes
	const replaceableMeshes = useMemo(() => {
		if (!vehicleConfig.addons) return new Set()
		const meshes = new Set()
		Object.values(vehicleConfig.addons).forEach((addon) => {
			if (addon.replace) meshes.add(addon.replace)
		})
		return meshes
	}, [vehicleConfig])

	// Handle replaced meshes (hide/show based on addon selection)
	useLayoutEffect(() => {
		if (replaceableMeshes.size === 0) return

		const meshesToHide = new Set()
		if (addons) {
			Object.entries(addons).forEach(([type, value]) => {
				const addonConfig = vehicleConfig.addons[type]
				if (value && addonConfig?.replace && addonConfig.options[value]) {
					meshesToHide.add(addonConfig.replace)
				}
			})
		}

		bodyScene.traverse((child) => {
			if (replaceableMeshes.has(child.name)) {
				child.visible = !meshesToHide.has(child.name)
			}
		})
	}, [bodyScene, vehicleConfig, addons, replaceableMeshes])

	// Build array of addon data (path and position)
	const addonData = useMemo(() => {
		return Object.entries(addons || {})
			.filter(([type, value]) => vehicleConfig['addons']?.[type]?.['options']?.[value])
			.map(([type, value]) => {
				const option = vehicleConfig['addons'][type]['options'][value]
				return {
					path: option.model,
					position: option.position,
				}
			})
	}, [vehicleConfig, addons])

	// Animate height
	useAnimateHeight(vehicle, height, height + 0.1)

	// Expose the ref to parent
	if (ref) {
		if (typeof ref === 'function') {
			ref(vehicle.current)
		} else {
			ref.current = vehicle.current
		}
	}

	return (
		<group ref={vehicle} name='Body' key={id}>
			<primitive object={bodyScene} />
			{addonData.length > 0 && (
				<group name='Addons'>
					{addonData.map((addon) => (
						<Suspense key={`${id}-${addon.path}`} fallback={null}>
							<Addon path={addon.path} color={color} roughness={roughness} position={addon.position} />
						</Suspense>
					))}
				</group>
			)}
			{lighting && <Lighting id={id} lighting={lighting} addons={addons} />}
		</group>
	)
})

VehicleBody.displayName = 'VehicleBody'

export default VehicleBody
