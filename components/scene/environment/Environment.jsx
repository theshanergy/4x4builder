import { memo } from 'react'

import Sun from './Sun'
import Sky from './Sky'
import Hawk from './Hawk'
import Terrain from './terrain/Terrain'
import Grass from './Grass'

// Environment component
const SceneEnvironment = memo(() => {
	return (
		<>
			{/* Sun */}
			<Sun />

			{/* Sky */}
			<Sky />

			{/* Hawk */}
			<Hawk />

			{/* Terrain */}
			<Terrain />

			{/* Grass */}
			<Grass />
		</>
	)
})

export default SceneEnvironment
