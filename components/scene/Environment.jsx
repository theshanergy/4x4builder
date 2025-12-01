import { memo, useMemo } from 'react'
import { Vector3 } from 'three'

import TerrainManager from './TerrainManager'
import Sky from './Sky'
import EnvMap from './EnvMap'
import Sun from './Sun'

// Environment component
const SceneEnvironment = memo(() => {
	// Sun direction - normalized vector pointing toward sun
	const sunDirection = useMemo(() => new Vector3(0.6, 0.45, 0.5).normalize(), [])

	return (
		<>
			{/* Sun directional light */}
			<Sun sunDirection={sunDirection} />

			{/* Atmospheric sky with procedural clouds */}
			<Sky sunPosition={[sunDirection.x, sunDirection.y, sunDirection.z]} />

			{/* Distant fog for depth - match horizon color */}
			<fog attach='fog' args={['#c5d5e8', 150, 450]} />

			{/* Environment map for reflections - captures sky and terrain once */}
			<EnvMap />

			{/* Terrain */}
			<TerrainManager />
		</>
	)
})

export default SceneEnvironment
