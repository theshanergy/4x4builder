import { memo, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Vector3 } from 'three'

import vehicleConfigs from '../../../vehicleConfigs'
import useTireDirtMaterial from '../../../hooks/useTireDirtMaterial'

// Calculate point on line (a to b, at length)
const linePoint = (a, b, length) => {
	let dir = b.clone().sub(a).normalize().multiplyScalar(length)
	return a.clone().add(dir)
}

// Tire component - loads and renders a single tire
const Tire = memo(({ tire, tire_diameter, tire_muddiness, rim_diameter, rim_width }) => {
	// Load tire model
	const tireGltf = useGLTF(vehicleConfigs.wheels.tires[tire].model)

	// Scale tire
	const tireGeometry = useMemo(() => {
		// Determine y scale as a percentage of width
		const wheelWidth = (rim_width * 2.54) / 100
		const wheelWidthScale = wheelWidth / vehicleConfigs.wheels.tires[tire].width

		const tireOD = vehicleConfigs.wheels.tires[tire].od / 2
		const tireID = vehicleConfigs.wheels.tires[tire].id / 2

		const newOd = (tire_diameter * 2.54) / 10 / 2
		const newId = (rim_diameter * 2.54) / 10 / 2

		// Create a copy of the original geometry
		const geometry = tireGltf.scene.children[0].geometry.clone()

		// Scale to match wheel width
		geometry.scale(1, 1, wheelWidthScale)

		// Get position attributes
		const positionAttribute = geometry.getAttribute('position')
		const positionArray = positionAttribute.array

		// Loop through vertices
		for (var i = 0, l = positionAttribute.count; i < l; i++) {
			// Start vector
			let startVector = new Vector3().fromBufferAttribute(positionAttribute, i)

			// Center vector
			let centerVector = new Vector3(0, 0, startVector.z)

			// Distance from center
			let centerDist = centerVector.distanceTo(startVector)

			// Distance from rim
			let rimDist = centerDist - tireID

			// Percentage from rim
			let percentOut = rimDist / (tireOD - tireID)

			// New distance from center
			let newRimDist = (percentOut * (newOd - newId) + newId) / 10

			// End vector
			let setVector = linePoint(centerVector, startVector, newRimDist)

			// Set x,y
			positionArray[i * 3] = setVector.x
			positionArray[i * 3 + 1] = setVector.y
		}

		return geometry
	}, [tireGltf.scene.children, rim_diameter, rim_width, tire, tire_diameter])

	// Calculate tire radius for shader
	const tireRadius = useMemo(() => (tire_diameter * 2.54) / 100 / 2, [tire_diameter])
	const rimRadius = useMemo(() => (rim_diameter * 2.54) / 100 / 2, [rim_diameter])

	// Create dirt shader callback
	const dirtShaderCallback = useTireDirtMaterial({ tireRadius, rimRadius, coverage: tire_muddiness })

	return (
		<mesh name='Tire' geometry={tireGeometry} castShadow receiveShadow>
			<meshStandardMaterial color='#121212' metalness={0} roughness={0.75} flatShading={true} onBeforeCompile={dirtShaderCallback} />
		</mesh>
	)
})

export default Tire
