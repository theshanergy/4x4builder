import { memo } from 'react'

import Terrain from './Terrain'
import Sky from './Sky'
import EnvMap from './EnvMap'
import Sun from './Sun'
import Hawk from './Hawk'

// Environment component
const SceneEnvironment = memo(() => {
	return (
		<>
			{/* Sun directional light */}
			<Sun />

			{/* Ambient light for better fill - cool sky, warm ground */}
			<hemisphereLight args={['#b1e1ff', '#d4c4a8', 0.6]} />

			{/* Atmospheric sky with procedural clouds */}
			<Sky />

			{/* Distant fog for depth - match horizon color */}
			<fog attach='fog' args={['#dbebf9', 150, 450]} />

			{/* Environment map for reflections - captures sky and terrain once */}
			<EnvMap />

			{/* Terrain with integrated grass */}
			<Terrain />

			{/* Flying Hawk */}
			<Hawk />
		</>
	)
})

export default SceneEnvironment
