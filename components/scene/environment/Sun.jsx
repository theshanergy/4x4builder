import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import useGameStore, { vehicleState } from '../../../store/gameStore'
import { sunDirection, sunColor } from '../../../config/environment'

// Sun directional sun that follows camera target
const Sun = () => {
	const sunRef = useRef()
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)

	useFrame(() => {
		const sun = sunRef.current

		if (!sun) return

		// Position sun based on sun direction relative to vehicle position
		const sunDistance = 50
		const targetPos = vehicleState.position
		sun.position.set(targetPos.x + sunDirection.x * sunDistance, targetPos.y + sunDirection.y * sunDistance, targetPos.z + sunDirection.z * sunDistance)
		sun.target.position.set(targetPos.x, targetPos.y, targetPos.z)
		sun.target.updateMatrixWorld()
	})

	// Use sun color from shared atmosphere config
	return (
		<directionalLight
			ref={sunRef}
			castShadow={!performanceDegraded}
			intensity={2.0}
			color={sunColor}
			shadow-mapSize={performanceDegraded ? [512, 512] : [1024, 1024]}
			shadow-camera-far={100}
			shadow-camera-left={-30}
			shadow-camera-right={30}
			shadow-camera-top={30}
			shadow-camera-bottom={-30}
			shadow-radius={2}
			shadow-normalBias={0.15}
		/>
	)
}

export default Sun
