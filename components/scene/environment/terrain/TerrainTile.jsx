import { useMemo, useEffect, memo } from 'react'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'

import { TILE_RESOLUTION, QUADTREE_MIN_SIZE } from '../../../../config/lod'
import { waterVisibility } from '../../../../store/gameStore'

const TERRAIN_RENDER_ORDER = -2
const WATER_RENDER_ORDER = -1

/**
 * Custom comparison for TerrainTile props.
 * Geometry identity captures everything tile-shape related (it is cached by
 * tile key + stitch signature upstream).
 */
const arePropsEqual = (prevProps, nextProps) =>
	prevProps.node.key === nextProps.node.key &&
	prevProps.geometry === nextProps.geometry &&
	prevProps.terrainMaterial === nextProps.terrainMaterial &&
	prevProps.waterMaterial === nextProps.waterMaterial

/**
 * TerrainTile - Renders a single quadtree leaf node from pre-built geometry.
 * Generation happens in the worker pool (see useTerrainTiles); geometry
 * lifecycle is owned by the streaming cache, so tiles never dispose it.
 *
 * @param {Object} props
 * @param {Object} props.node - Quadtree node with centerX, centerZ, size, key
 * @param {Object} props.geometry - { terrainGeometry, waterGeometry, heightCache }
 * @param {THREE.Material} props.terrainMaterial - Shared terrain material instance
 * @param {THREE.Material} props.waterMaterial - Shared water material instance
 */
const TerrainTile = memo(({ node, geometry, terrainMaterial, waterMaterial }) => {
	const { centerX, centerZ } = node
	const position = useMemo(() => [centerX, 0, centerZ], [centerX, centerZ])
	const { terrainGeometry, waterGeometry, heightCache } = geometry

	// Build a physics collider only for the highest-detail tiles.
	// Reuses heightCache from the visual geometry so we don't resample.
	const colliderArgs = useMemo(() => {
		if (node.size !== QUADTREE_MIN_SIZE) return null
		return [TILE_RESOLUTION, TILE_RESOLUTION, heightCache, { x: node.size, y: 1, z: node.size }]
	}, [node.size, heightCache])

	// Track this tile's contribution to the on-screen water count so the
	// water material can skip its reflection pass when no water is visible.
	useEffect(() => {
		if (!waterGeometry) return
		waterVisibility.visibleTileCount++
		return () => {
			waterVisibility.visibleTileCount--
		}
	}, [waterGeometry])

	return (
		<>
			<group position={position}>
				{terrainMaterial && <mesh geometry={terrainGeometry} material={terrainMaterial} receiveShadow renderOrder={TERRAIN_RENDER_ORDER} />}
				{waterMaterial && waterGeometry && <mesh geometry={waterGeometry} material={waterMaterial} renderOrder={WATER_RENDER_ORDER} />}
			</group>
			{colliderArgs && (
				<RigidBody type='fixed' position={position} colliders={false}>
					<HeightfieldCollider args={colliderArgs} />
				</RigidBody>
			)}
		</>
	)
}, arePropsEqual)

export default TerrainTile
