import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import ENVIRONMENT_CONFIG from '../../../config/environment'
import useGameStore, { vehicleState } from '../../../store/gameStore'

// Sun directional light that follows camera target
const Sun = () => {
	const sunRef = useRef()
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)

	const { sunDirection, sunColor, skyColorHorizon } = ENVIRONMENT_CONFIG

	useFrame(() => {
		const sun = sunRef.current

		if (!sun) return

		// Position light based on sun direction relative to vehicle position
		const sunDistance = 50
		const targetPos = vehicleState.position
		sun.position.set(targetPos.x + sunDirection.x * sunDistance, sunDirection.y * sunDistance, targetPos.z + sunDirection.z * sunDistance)
		sun.target.position.set(targetPos.x, targetPos.y, targetPos.z)
		sun.target.updateMatrixWorld()
	})

	// Warm sunlight color
	return (
		<>
			<directionalLight
				ref={sunRef}
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
			<hemisphereLight intensity={0.4} color={skyColorHorizon} groundColor='#7f8b73' />
		</>
	)
}

export default Sun
