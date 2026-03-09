import { useMemo, memo } from 'react'

import { TILE_RESOLUTION } from '../../../../config/lod'
import useTerrainGeometry from '../../../../hooks/useTerrainGeometry'
import Vegetation from './Vegetation'

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

	const effectiveEdgeStitchInfo = edgeStitchInfo || DEFAULT_EDGE_STITCH_INFO

	// Geometry comes from the shared cache — no disposal on unmount
	const { terrainGeometry, waterGeometry } = useTerrainGeometry(node, terrainHelpers, effectiveEdgeStitchInfo)

	return (
		<>
			<group position={position}>
				{terrainMaterial && <mesh geometry={terrainGeometry} material={terrainMaterial} receiveShadow />}
				{waterMaterial && waterGeometry && <mesh geometry={waterGeometry} material={waterMaterial} renderOrder={1} />}
			</group>
			<Vegetation node={node} terrainHelpers={terrainHelpers} vegetationModels={vegetationModels} />
		</>
	)
}, arePropsEqual)

export default TerrainTile
