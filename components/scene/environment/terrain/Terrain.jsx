import { useMemo, useEffect } from 'react'

import { createTerrainHelpers } from '../../../../utils/terrain/heightSampler'
import useTerrainTiles from '../../../../hooks/useTerrainTiles'
import useWaterMaterial from '../../../../hooks/useWaterMaterial'
import useTerrainMaterial from '../../../../hooks/useTerrainMaterial'
import useVegetation from '../../../../hooks/useVegetation'
import useGameStore from '../../../../store/gameStore'
import TerrainTile from './TerrainTile'
import VegetationSystem from './VegetationSystem'

// Main terrain component
const Terrain = () => {
	// Quadtree LOD streaming — tile geometry is generated in the worker pool
	const renderTiles = useTerrainTiles()

	// Shared terrain helpers (height/normal sampling) for gameplay systems:
	// physics queries, buoyancy, tire tracks, spawning etc.
	const terrainHelpers = useMemo(() => createTerrainHelpers(), [])

	// Register terrain helpers in the game store
	useEffect(() => {
		useGameStore.getState().setTerrainHelpers(terrainHelpers)
	}, [terrainHelpers])

	// Terrain material shared by all terrain tiles
	const terrainMaterial = useTerrainMaterial(terrainHelpers)

	// Water material shared by all water tiles
	const waterMaterial = useWaterMaterial()

	// Load vegetation models (LOD 0-3)
	const vegetationModels = useVegetation()

	return (
		<group name='Terrain'>
			{renderTiles.map(({ node, geometry }) => (
				<TerrainTile key={node.key} node={node} geometry={geometry} terrainMaterial={terrainMaterial} waterMaterial={waterMaterial} />
			))}
			<VegetationSystem vegetationModels={vegetationModels} />
		</group>
	)
}

export default Terrain
