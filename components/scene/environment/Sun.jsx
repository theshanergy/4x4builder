import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import useGameStore, { vehicleState } from '../../../store/gameStore'

// Sun directional light that follows camera target
const Sun = ({ sunDirection }) => {
	const lightRef = useRef()
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)

	useFrame(() => {
		const light = lightRef.current

		if (!light) return

		// Position light based on sun direction relative to vehicle position
		const lightDistance = 50
		const targetPos = vehicleState.position
		light.position.set(targetPos.x + sunDirection.x * lightDistance, sunDirection.y * lightDistance, targetPos.z + sunDirection.z * lightDistance)
		light.target.position.set(targetPos.x, targetPos.y, targetPos.z)
		light.target.updateMatrixWorld()
	})

	// Warm sunlight color
	return (
		<directionalLight
			ref={lightRef}
			castShadow={!performanceDegraded}
			intensity={2.5}
			color='#fff0dd'
			position={[10, 10, 10]}
			shadow-mapSize={performanceDegraded ? [512, 512] : [2048, 2048]}
			shadow-camera-far={100}
			shadow-camera-left={-30}
			shadow-camera-right={30}
			shadow-camera-top={30}
			shadow-camera-bottom={-30}
			shadow-bias={-0.0001}
		/>
	)
}

export default Sun
