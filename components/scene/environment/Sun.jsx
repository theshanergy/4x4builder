import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import useGameStore, { vehicleState } from '../../../store/gameStore'
import { sunDirection, sunColor } from '../../../config/environment'

// Sun directional light that follows camera target
const Sun = () => {
	const lightRef = useRef()
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)

	useFrame(() => {
		const light = lightRef.current

		if (!light) return

		// Position light based on sun direction relative to vehicle position
		const lightDistance = 50
		const targetPos = vehicleState.position
		light.position.set(targetPos.x + sunDirection.x * lightDistance, targetPos.y + sunDirection.y * lightDistance, targetPos.z + sunDirection.z * lightDistance)
		light.target.position.set(targetPos.x, targetPos.y, targetPos.z)
		light.target.updateMatrixWorld()
	})

	// Use sun color from shared atmosphere config
	return (
		<directionalLight
			ref={lightRef}
			castShadow={!performanceDegraded}
			intensity={2.5}
			color={sunColor}
			position={[10, 10, 10]}
			shadow-mapSize={performanceDegraded ? [512, 512] : [1024, 1024]}
			shadow-camera-far={100}
			shadow-camera-left={-30}
			shadow-camera-right={30}
			shadow-camera-top={30}
			shadow-camera-bottom={-30}
			shadow-radius={2}
		/>
	)
}

export default Sun
