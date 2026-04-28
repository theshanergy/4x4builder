import { memo } from 'react'

import Sun from './Sun'
import Sky from './Sky'
import Hawk from './Hawk'
import Terrain from './terrain/Terrain'

// Environment component
const SceneEnvironment = memo(() => {
	return (
		<>
			{/* Sun */}
			<Sun />

			{/* Atmospheric sky with procedural clouds */}
			<Sky />

			{/* Hawk */}
			<Hawk />

			{/* Terrain */}
			<Terrain />
		</>
	)
})

export default SceneEnvironment
