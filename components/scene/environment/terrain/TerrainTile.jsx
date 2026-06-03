import { useMemo, useEffect, useRef, memo } from 'react'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'

import { TILE_RESOLUTION, QUADTREE_MIN_SIZE } from '../../../../config/lod'
import useTerrainGeometry from '../../../../hooks/useTerrainGeometry'
import { waterVisibility } from '../../../../store/gameStore'
import Vegetation from './Vegetation'

const TERRAIN_RENDER_ORDER = -2
const WATER_RENDER_ORDER = -1

// Default edge stitch info (no stitching needed)
const DEFAULT_EDGE_STITCH_INFO = {
	north: { needsStitch: false, neighborStep: 32 / TILE_RESOLUTION },
	south: { needsStitch: false, neighborStep: 32 / TILE_RESOLUTION },
	east: { needsStitch: false, neighborStep: 32 / TILE_RESOLUTION },
	west: { needsStitch: false, neighborStep: 32 / TILE_RESOLUTION },
}

/**
 * Custom comparison for QuadtreeTerrainTile props.
 * Prevents unnecessary re-renders when props haven't meaningfully changed.
 */
const arePropsEqual = (prevProps, nextProps) => {
	// Check properties that affect rendering
	if (
		prevProps.node.key !== nextProps.node.key ||
		prevProps.node.size !== nextProps.node.size ||
		prevProps.node.centerX !== nextProps.node.centerX ||
		prevProps.node.centerZ !== nextProps.node.centerZ
	) {
		return false
	}

	// Edge stitch info deep comparison
	const prevEdge = prevProps.edgeStitchInfo
	const nextEdge = nextProps.edgeStitchInfo
	if (prevEdge !== nextEdge) {
		if (!prevEdge || !nextEdge) return false
		if (
			prevEdge.north.needsStitch !== nextEdge.north.needsStitch ||
			prevEdge.south.needsStitch !== nextEdge.south.needsStitch ||
			prevEdge.east.needsStitch !== nextEdge.east.needsStitch ||
			prevEdge.west.needsStitch !== nextEdge.west.needsStitch ||
			prevEdge.north.neighborStep !== nextEdge.north.neighborStep ||
			prevEdge.south.neighborStep !== nextEdge.south.neighborStep ||
			prevEdge.east.neighborStep !== nextEdge.east.neighborStep ||
			prevEdge.west.neighborStep !== nextEdge.west.neighborStep
		) {
			return false
		}
	}

	// Reference comparisons for objects that should be stable
	if (
		prevProps.terrainHelpers !== nextProps.terrainHelpers ||
		prevProps.terrainMaterial !== nextProps.terrainMaterial ||
		prevProps.waterMaterial !== nextProps.waterMaterial ||
		prevProps.vegetationModels !== nextProps.vegetationModels
	) {
		return false
	}

	return true
}

/**
 * TerrainTile - Renders a single quadtree leaf node as terrain geometry with vegetation.
 *
 * @param {Object} props
 * @param {Object} props.node - Quadtree node with centerX, centerZ, size, key
 * @param {Object} props.terrainHelpers - Height/normal sampling functions
 * @param {Object} props.edgeStitchInfo - Edge stitching configuration
 * @param {THREE.Material} props.terrainMaterial - Shared terrain material instance
 * @param {THREE.Material} props.waterMaterial - Shared water material instance
 * @param {Object} props.vegetationModels - Vegetation LOD models from useVegetation
 */
const TerrainTile = memo(({ node, terrainHelpers, edgeStitchInfo, terrainMaterial, waterMaterial, vegetationModels }) => {
	const { centerX, centerZ } = node
	const position = useMemo(() => [centerX, 0, centerZ], [centerX, centerZ])

	// Track geometry refs for proper disposal
	const terrainGeometryRef = useRef(null)
	const waterGeometryRef = useRef(null)

	// Use effective edge stitch info for both terrain and water
	const effectiveEdgeStitchInfo = edgeStitchInfo || DEFAULT_EDGE_STITCH_INFO

	// Create geometries
	const { terrainGeometry, waterGeometry, heightCache } = useTerrainGeometry(node, terrainHelpers, effectiveEdgeStitchInfo)

	// Build a physics collider only for the highest-detail tiles.
	// Reuses heightCache from the visual geometry so we don't resample or transpose.
	const colliderArgs = useMemo(() => {
		if (node.size !== QUADTREE_MIN_SIZE) return null
		return [TILE_RESOLUTION, TILE_RESOLUTION, heightCache, { x: node.size, y: 1, z: node.size }]
	}, [node.size, heightCache])

	// Helper to manage geometry lifecycle (disposal on change and unmount)
	const useGeometryDisposal = (geometryRef, geometry) => {
		useEffect(() => {
			// Dispose previous geometry if it exists and is different
			if (geometryRef.current && geometryRef.current !== geometry) {
				geometryRef.current.dispose()
			}
			geometryRef.current = geometry

			return () => {
				if (geometryRef.current) {
					geometryRef.current.dispose()
					geometryRef.current = null
				}
			}
		}, [geometry])
	}

	// Dispose old geometries when they change and on unmount
	useGeometryDisposal(terrainGeometryRef, terrainGeometry)
	useGeometryDisposal(waterGeometryRef, waterGeometry)

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
			<Vegetation node={node} terrainHelpers={terrainHelpers} vegetationModels={vegetationModels} />
		</>
	)
}, arePropsEqual)

export default TerrainTile
