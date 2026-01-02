import { memo } from 'react'

import Sun from './Sun'
import Sky from './Sky'
import Hawk from './Hawk'
import Terrain from './terrain/Terrain'
import Water from './Water'
import Grass from './Grass'

// Environment component
const SceneEnvironment = memo(() => {
	return (
		<>
			{/* Sun directional light */}
			<Sun />

			{/* Atmospheric sky with procedural clouds */}
			<Sky />

			{/* Flying Hawk */}
			<Hawk />

			{/* Terrain with integrated grass */}
			<Terrain />

			{/* Water plane */}
			<Water />

			{/* Grass rendering */}
			<Grass />
		</>
	)
})

export default SceneEnvironment
