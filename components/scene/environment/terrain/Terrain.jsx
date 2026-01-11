import { useMemo, useEffect } from 'react'
import { Noise } from 'noisejs'

import { createTerrainHelpers } from '../../../../utils/terrain/heightSampler'
import useTerrainQuadtree from '../../../../hooks/useTerrainQuadtree'
import useWaterMaterial from '../../../../hooks/useWaterMaterial'
import useTerrainMaterial from '../../../../hooks/useTerrainMaterial'
import useVegetation from '../../../../hooks/useVegetation'
import useGameStore from '../../../../store/gameStore'
import TERRAIN_CONFIG from '../../../../config/terrain'
import WATER_CONFIG from '../../../../config/water'
import TerrainCollider from './TerrainCollider'
import TerrainTile from './TerrainTile'

// Main terrain component
const Terrain = () => {
	// Use quadtree LOD system
	const leafTiles = useTerrainQuadtree()

	// Generate noise instance with seed from config
	const noise = useMemo(() => new Noise(TERRAIN_CONFIG.seed), [TERRAIN_CONFIG.seed])

	// Create shared terrain helpers (height/normal sampling)
	const terrainHelpers = useMemo(() => createTerrainHelpers(noise, TERRAIN_CONFIG, WATER_CONFIG), [noise, TERRAIN_CONFIG, WATER_CONFIG])

	// Register terrain functions in the game store
	useEffect(() => {
		useGameStore.getState().setTerrainHeightFunction(terrainHelpers.getWorldHeight)
		useGameStore.getState().setTerrainNormalFunction(terrainHelpers.getNormal)
	}, [terrainHelpers])

	// Terrain material shared by all terrain tiles
	const terrainMaterial = useTerrainMaterial()

	// Water material shared by all water tiles
	const waterMaterial = useWaterMaterial()

	// Load vegetation models (LOD 0-3)
	const vegetationModels = useVegetation()

	return (
		<group name='Terrain'>
			<TerrainCollider terrainHelpers={terrainHelpers} />
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
