import { useMemo, useEffect } from 'react'
import { useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import { Noise } from 'noisejs'

import { TERRAIN_LAYERS } from '../../../../config/terrain'
import { createTerrainHelpers } from '../../../../utils/terrain/heightSampler'
import useTerrainQuadtree from '../../../../hooks/useTerrainQuadtree'
import useGameStore from '../../../../store/gameStore'
import TerrainCollider from './TerrainCollider'
import TerrainTile from './TerrainTile'

// Main terrain component
const Terrain = () => {
	// Use quadtree LOD system
	const leafTiles = useTerrainQuadtree()

	// Generate noise instance with fixed seed for consistency
	const noise = useMemo(() => new Noise(1234), [])

	// Create shared terrain helpers (height/normal sampling)
	const terrainHelpers = useMemo(() => createTerrainHelpers(noise), [noise])

	// Register terrain functions in the game store
	useEffect(() => {
		useGameStore.getState().setTerrainHeightFunction(terrainHelpers.getWorldHeight)
		useGameStore.getState().setTerrainNormalFunction(terrainHelpers.getNormal)
	}, [terrainHelpers])

	// Build texture paths array from layer config
	const texturePaths = useMemo(() => TERRAIN_LAYERS.flatMap((layer) => [layer.textures.albedo, layer.textures.normal]), [])

	// Load all layer textures
	const loadedTextures = useLoader(TextureLoader, texturePaths)

	// Organize textures by layer name
	const layerTextures = useMemo(() => {
		const result = {}
		TERRAIN_LAYERS.forEach((layer, index) => {
			result[layer.name] = {
				albedo: loadedTextures[index * 2],
				normal: loadedTextures[index * 2 + 1],
			}
		})
		return result
	}, [loadedTextures])

	return (
		<group name='Terrain'>
			<TerrainCollider terrainHelpers={terrainHelpers} />
			{leafTiles.map(({ node, edgeStitchInfo }) => (
				<TerrainTile key={node.key} node={node} terrainHelpers={terrainHelpers} layerTextures={layerTextures} edgeStitchInfo={edgeStitchInfo} />
			))}
		</group>
	)
}

export default Terrain
