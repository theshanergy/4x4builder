import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import useGameStore from '../../store/gameStore'

// Sun directional light that follows camera target
const Sun = ({ sunDirection }) => {
	const lightRef = useRef()
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)

	useFrame(() => {
		const light = lightRef.current
		const cameraTarget = useGameStore.getState().cameraTarget

		if (!light) return

		// Position light based on sun direction relative to camera target
		const lightDistance = 50
		light.position.set(cameraTarget.x + sunDirection.x * lightDistance, sunDirection.y * lightDistance, cameraTarget.z + sunDirection.z * lightDistance)
		light.target.position.copy(cameraTarget)
		light.target.updateMatrixWorld()
	})

	// Warm sunlight color
	return (
		<directionalLight
			ref={lightRef}
			castShadow={!performanceDegraded}
			intensity={2.5}
			color='#fff5e6'
			position={[10, 10, 10]}
			shadow-mapSize={performanceDegraded ? [512, 512] : [1024, 1024]}
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
