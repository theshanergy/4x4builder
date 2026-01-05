import { useEffect, useRef, memo } from 'react'

import { TILE_RESOLUTION } from '../../../../config/terrain'
import useWaterGeometry from '../../../../hooks/useWaterGeometry'

// Default edge stitch info (no stitching needed)
const DEFAULT_EDGE_STITCH_INFO = {
	north: { needsStitch: false, neighborStep: 32 / TILE_RESOLUTION },
	south: { needsStitch: false, neighborStep: 32 / TILE_RESOLUTION },
	east: { needsStitch: false, neighborStep: 32 / TILE_RESOLUTION },
	west: { needsStitch: false, neighborStep: 32 / TILE_RESOLUTION },
}

/**
 * Custom comparison for WaterTile props.
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
	if (prevProps.terrainHelpers !== nextProps.terrainHelpers || prevProps.waterMaterial !== nextProps.waterMaterial) {
		return false
	}

	return true
}

/**
 * WaterTile - Renders water surface for a single quadtree leaf node.
 * Only renders if there is water (terrain below WATER_LEVEL) in this tile.
 *
 * @param {Object} props
 * @param {Object} props.node - Quadtree node with centerX, centerZ, size, key
 * @param {Object} props.terrainHelpers - Height sampling functions
 * @param {THREE.Material} props.waterMaterial - Shared water material instance
 * @param {Object} props.edgeStitchInfo - Edge stitching configuration
 */
const WaterTile = memo(({ node, terrainHelpers, waterMaterial, edgeStitchInfo }) => {
	// Track geometry ref for proper disposal
	const geometryRef = useRef(null)

	// Create water geometry (returns null if no water in this tile)
	const geometry = useWaterGeometry(node, terrainHelpers, edgeStitchInfo || DEFAULT_EDGE_STITCH_INFO)

	// Dispose old geometry when it changes and on unmount
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

	// Don't render if no water in this tile
	if (!geometry) {
		return null
	}

	// Note: No position needed - geometry is in local tile coordinates
	// and this component is already a child of the positioned TerrainTile group
	return <mesh geometry={geometry} material={waterMaterial} />
}, arePropsEqual)

export default WaterTile
