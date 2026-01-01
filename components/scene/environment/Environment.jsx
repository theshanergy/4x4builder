import { memo } from 'react'

import Sun from './Sun'
import Sky from './Sky'
import Hawk from './Hawk'
import Terrain from './terrain/Terrain'

// Environment component
// Uses shared atmosphere config for consistent lighting
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
		</>
	)
})

export default SceneEnvironment
