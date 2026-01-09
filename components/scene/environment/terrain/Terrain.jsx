import { useMemo, useEffect } from 'react'
import { Noise } from 'noisejs'

import { createTerrainHelpers } from '../../../../utils/terrain/heightSampler'
import useTerrainQuadtree from '../../../../hooks/useTerrainQuadtree'
import useWaterMaterial from '../../../../hooks/useWaterMaterial'
import useTerrainMaterial from '../../../../hooks/useTerrainMaterial'
import useVegetation from '../../../../hooks/useVegetation'
import useGameStore from '../../../../store/gameStore'
import { useBiomeTerrain, useBiomeWater } from '../../../../hooks/useBiome'
import TerrainCollider from './TerrainCollider'
import TerrainTile from './TerrainTile'

// Main terrain component
const Terrain = () => {
	// Use quadtree LOD system
	const leafTiles = useTerrainQuadtree()

	// Get current biome configs (triggers re-render on biome change or HMR)
	const terrainConfig = useBiomeTerrain()
	const waterConfig = useBiomeWater()

	// Generate noise instance with fixed seed for consistency
	const noise = useMemo(() => new Noise(1234), [])

	// Create shared terrain helpers (height/normal sampling)
	const terrainHelpers = useMemo(() => createTerrainHelpers(noise, terrainConfig, waterConfig), [noise, terrainConfig, waterConfig])

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
