import { memo } from 'react'
import { Color } from 'three'

import Terrain from './terrain/Terrain'
import Sky from './Sky'
import EnvMap from './EnvMap'
import Sun from './Sun'
import Hawk from './Hawk'

// Environment component
// Uses shared atmosphere config for consistent lighting
const SceneEnvironment = memo(() => {
	return (
		<>
			{/* Sun directional light */}
			<Sun />

			{/* Ambient light for better fill */}
			<hemisphereLight args={[new Color().setHSL(0.56, 1.0, 0.85), new Color().setHSL(0.09, 0.34, 0.75), 0.6]} />

			{/* Atmospheric sky with procedural clouds */}
			<Sky />

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
