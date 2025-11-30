import { memo, useRef, useMemo } from 'react'
import { useFrame, useThree, useLoader } from '@react-three/fiber'
import { TextureLoader, EquirectangularReflectionMapping, Vector3 } from 'three'

import useGameStore from '../../store/gameStore'
import TerrainManager from './TerrainManager'
import AtmosphericSky from './Sky'

// Equirectangular environment map
const EquirectEnvMap = () => {
	const texture = useLoader(TextureLoader, '/assets/images/envmap/gainmap.webp')
	texture.mapping = EquirectangularReflectionMapping
	texture.needsUpdate = true

	useThree(({ scene }) => {
		scene.environment = texture
	})

	return null
}

// Camera target light
const TargetLight = ({ sunDirection }) => {
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

// Environment component
const SceneEnvironment = memo(() => {
	// Sun direction - normalized vector pointing toward sun
	const sunDirection = useMemo(() => new Vector3(0.6, 0.45, 0.5).normalize(), [])

	return (
		<>
			{/* Camera target light */}
			<TargetLight sunDirection={sunDirection} />

			{/* Atmospheric sky with procedural clouds */}
			<AtmosphericSky sunPosition={[sunDirection.x, sunDirection.y, sunDirection.z]} />

			{/* Distant fog for depth - match horizon color */}
			<fog attach='fog' args={['#c5d5e8', 150, 450]} />

			{/* Environment map for reflections */}
			<EquirectEnvMap />

			{/* Terrain */}
			<TerrainManager />
		</>
	)
})

export default SceneEnvironment
