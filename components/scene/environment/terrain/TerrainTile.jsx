import { useMemo, useEffect, useRef, memo } from 'react'

import { DEFAULT_EDGE_STITCH_INFO } from '../../../../utils/terrain/quadtree'
import useTerrainGeometry from '../../../../hooks/useTerrainGeometry'
import TerrainMaterial from './TerrainMaterial'
import TerrainCollider from './TerrainCollider'

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
		prevProps.node.centerZ !== nextProps.node.centerZ ||
		prevProps.hasCollider !== nextProps.hasCollider
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
	if (prevProps.terrainHelpers !== nextProps.terrainHelpers || prevProps.layerTextures !== nextProps.layerTextures) {
		return false
	}

	return true
}

/**
 * TerrainTile - Renders a single quadtree leaf node as terrain geometry.
 *
 * @param {Object} props
 * @param {Object} props.node - Quadtree node with centerX, centerZ, size, key
 * @param {Object} props.terrainHelpers - Height/normal sampling functions
 * @param {Object} props.layerTextures - Textures for each terrain layer { layerName: { albedo, normal } }
 * @param {boolean} props.hasCollider - Whether to include physics collider
 * @param {Object} props.edgeStitchInfo - Edge stitching configuration
 */
const TerrainTile = memo(({ node, terrainHelpers, layerTextures, hasCollider = false, edgeStitchInfo }) => {
	const { centerX, centerZ } = node
	const position = useMemo(() => [centerX, 0, centerZ], [centerX, centerZ])

	// Track geometry ref for proper disposal
	const geometryRef = useRef(null)

	// Create geometry
	const geometry = useTerrainGeometry(node, terrainHelpers, edgeStitchInfo || DEFAULT_EDGE_STITCH_INFO)

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

	const terrainMesh = (
		<mesh geometry={geometry} receiveShadow>
			<TerrainMaterial layerTextures={layerTextures} />
		</mesh>
	)

	// Render with or without physics collider
	if (hasCollider) {
		return (
			<TerrainCollider node={node} terrainHelpers={terrainHelpers} position={position}>
				{terrainMesh}
			</TerrainCollider>
		)
	}

	return <group position={position}>{terrainMesh}</group>
}, arePropsEqual)

export default TerrainTile
