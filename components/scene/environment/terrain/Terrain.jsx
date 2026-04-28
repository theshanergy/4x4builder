import { useMemo, useEffect } from 'react'

import { createTerrainHelpers } from '../../../../utils/terrain/heightSampler'
import useTerrainQuadtree from '../../../../hooks/useTerrainQuadtree'
import useWaterMaterial from '../../../../hooks/useWaterMaterial'
import useTerrainMaterial from '../../../../hooks/useTerrainMaterial'
import useVegetation from '../../../../hooks/useVegetation'
import useGameStore from '../../../../store/gameStore'
import TerrainTile from './TerrainTile'

// Main terrain component
const Terrain = () => {
	// Use quadtree LOD system
	const leafTiles = useTerrainQuadtree()

	// Create shared terrain helpers (height/normal/ridgemap sampling)
	const terrainHelpers = useMemo(() => createTerrainHelpers(), [])

	// Register terrain helpers in the game store
	useEffect(() => {
		useGameStore.getState().setTerrainHelpers(terrainHelpers)
	}, [terrainHelpers])

	// Terrain material shared by all terrain tiles
	const terrainMaterial = useTerrainMaterial()

	// Water material shared by all water tiles
	const waterMaterial = useWaterMaterial()

	// Load vegetation models (LOD 0-3)
	const vegetationModels = useVegetation()

	return (
		<group name='Terrain'>
			{leafTiles.map(({ node, edgeStitchInfo }) => (
				<TerrainTile
					key={node.key}
					node={node}
					terrainHelpers={terrainHelpers}
					edgeStitchInfo={edgeStitchInfo}
					terrainMaterial={terrainMaterial}
					waterMaterial={waterMaterial}
					vegetationModels={vegetationModels}
				/>
			))}
		</group>
	)
}

export default Terrain
