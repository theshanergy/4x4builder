import { memo } from 'react'

import Terrain from './terrain/Terrain'
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
