// Terrain Tile Component

// React component for rendering a single quadtree terrain tile with optional
// physics collider support.

import { useMemo, useEffect, useCallback, useRef, memo } from 'react'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'

import { TILE_RESOLUTION } from '../../../../config/terrain'
import { createTileGeometry } from './geometry'
import useTerrainCollider from '../../../../hooks/useTerrainCollider'
import TerrainMaterial from './TerrainMaterial'

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
	if (prevProps.terrainHelpers !== nextProps.terrainHelpers || prevProps.map !== nextProps.map || prevProps.normalMap !== nextProps.normalMap) {
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
 * @param {Texture} props.map - Diffuse texture
 * @param {Texture} props.normalMap - Normal map texture
 * @param {boolean} props.hasCollider - Whether to include physics collider
 * @param {Object} props.edgeStitchInfo - Edge stitching configuration
 */
const TerrainTile = memo(({ node, terrainHelpers, map, normalMap, cliffMap, cliffNormalMap, hasCollider = false, edgeStitchInfo }) => {
	const { size, centerX, centerZ } = node
	const position = useMemo(() => [centerX, 0, centerZ], [centerX, centerZ])

	// Create height/normal/UV functions for physics collider
	const getHeight = useCallback(
		(localX, localZ) => {
			const worldX = centerX + localX - size / 2
			const worldZ = centerZ + localZ - size / 2
			return terrainHelpers.getRawHeight(worldX, worldZ)
		},
		[centerX, centerZ, size, terrainHelpers]
	)

	const getNormal = useCallback(
		(localX, localZ, target) => {
			const worldX = centerX + localX - size / 2
			const worldZ = centerZ + localZ - size / 2
			return terrainHelpers.getNormal(worldX, worldZ, target)
		},
		[centerX, centerZ, size, terrainHelpers]
	)

	const getUV = useCallback(
		(localX, localZ) => {
			const worldX = centerX + localX - size / 2
			const worldZ = centerZ + localZ - size / 2
			return [worldX, worldZ]
		},
		[centerX, centerZ, size]
	)

	// Only compute collider data for tiles that need physics (smallest tiles)
	// This avoids expensive computation for the majority of tiles
	const colliderData = useTerrainCollider(
		hasCollider
			? {
					segments: TILE_RESOLUTION,
					size,
					getHeight,
					getNormal,
					getUV,
			  }
			: { segments: 1, size: 1, getHeight: () => 0, getNormal: null, getUV: null }
	)

	// Create a stable key for edge stitch info
	const edgeStitchKey = useMemo(() => {
		if (!edgeStitchInfo) return 'none'
		const { north: n, south: s, east: e, west: w } = edgeStitchInfo
		return `${n.needsStitch}:${n.neighborStep},${s.needsStitch}:${s.neighborStep},${e.needsStitch}:${e.neighborStep},${w.needsStitch}:${w.neighborStep}`
	}, [edgeStitchInfo])

	// Track geometry ref for proper disposal
	const geometryRef = useRef(null)

	// Create geometry
	const geometry = useMemo(() => {
		return createTileGeometry(node, terrainHelpers, edgeStitchInfo)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [node.key, terrainHelpers, edgeStitchKey])

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

	// Render with or without physics collider
	if (hasCollider) {
		return (
			<RigidBody type='fixed' position={position} colliders={false}>
				<HeightfieldCollider args={colliderData.colliderArgs} name={`QTTile-${node.key}`} />
				<mesh geometry={geometry} receiveShadow>
					<TerrainMaterial sandTexture={map} sandNormalMap={normalMap} cliffTexture={cliffMap} cliffNormalMap={cliffNormalMap} />
				</mesh>
			</RigidBody>
		)
	}

	return (
		<mesh geometry={geometry} position={position} receiveShadow>
			<TerrainMaterial sandTexture={map} sandNormalMap={normalMap} cliffTexture={cliffMap} cliffNormalMap={cliffNormalMap} />
		</mesh>
	)
}, arePropsEqual)

export default TerrainTile
