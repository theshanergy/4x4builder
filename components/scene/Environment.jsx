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

			{/* Ambient light for better fill - cool sky, warm ground */}
			<hemisphereLight args={['#b1e1ff', '#d4c4a8', 0.6]} />

			{/* Atmospheric sky with procedural clouds */}
			<Sky sunPosition={[sunDirection.x, sunDirection.y, sunDirection.z]} />

			{/* Distant fog for depth - match horizon color */}
			<fog attach='fog' args={['#dbebf9', 150, 450]} />

			{/* Environment map for reflections - captures sky and terrain once */}
			<EnvMap />

			{/* Terrain with integrated grass */}
			<TerrainManager />
		</>
	)
})

export default SceneEnvironment
