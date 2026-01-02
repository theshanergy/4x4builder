import { useState, useRef, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import { Noise } from 'noisejs'

import { vehicleState } from '../../../../store/gameStore'
import { QUADTREE_ROOT_SIZE, QUADTREE_MIN_SIZE, LOD_SPLIT_FACTOR, LOD_HYSTERESIS, TERRAIN_LAYERS } from '../../../../config/terrain'
import { QuadtreeNode, getEdgeStitchInfo, DEFAULT_EDGE_STITCH_INFO } from '../../../../utils/terrainQuadtree'
import { createTerrainHelpers } from '../../../../utils/terrainGenerator'
import TerrainTile from './TerrainTile'

/**
 * Terrain - Main terrain component with quadtree LOD.
 */
const Terrain = () => {
	const [leafTiles, setLeafTiles] = useState([])
	const lastUpdatePosition = useRef({ x: null, z: null })

	// Quadtree roots - covers the entire terrain area
	// Multiple roots arranged in a grid for infinite terrain
	const quadtreeRoots = useRef(new Map())

	// Generate noise instance with fixed seed for consistency
	const noise = useMemo(() => new Noise(1234), [])

	// Build texture paths array from layer config
	const texturePaths = useMemo(() => {
		const paths = []
		TERRAIN_LAYERS.forEach((layer) => {
			paths.push(layer.textures.albedo)
			paths.push(layer.textures.normal)
		})
		return paths
	}, [])

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

	// Create shared terrain helpers (height/normal sampling)
	// This also registers the height/normal functions in the game store
	const terrainHelpers = useMemo(() => createTerrainHelpers(noise), [noise])

	// Update quadtree based on vehicle position each frame
	useFrame(() => {
		const centerPosition = vehicleState.position

		// Use a smaller threshold for updates
		const updateThreshold = QUADTREE_MIN_SIZE / 2
		const dx = centerPosition.x - (lastUpdatePosition.current.x || 0)
		const dz = centerPosition.z - (lastUpdatePosition.current.z || 0)
		const movedDistance = Math.sqrt(dx * dx + dz * dz)

		// Only update if moved enough
		if (movedDistance < updateThreshold && lastUpdatePosition.current.x !== null) {
			return
		}
		lastUpdatePosition.current.x = centerPosition.x
		lastUpdatePosition.current.z = centerPosition.z

		// Determine which quadtree roots we need based on player position
		const rootsNeeded = new Set()
		const viewRange = QUADTREE_ROOT_SIZE * 2

		for (let rx = -viewRange; rx <= viewRange; rx += QUADTREE_ROOT_SIZE) {
			for (let rz = -viewRange; rz <= viewRange; rz += QUADTREE_ROOT_SIZE) {
				const rootX = Math.floor((centerPosition.x + rx) / QUADTREE_ROOT_SIZE) * QUADTREE_ROOT_SIZE + QUADTREE_ROOT_SIZE / 2
				const rootZ = Math.floor((centerPosition.z + rz) / QUADTREE_ROOT_SIZE) * QUADTREE_ROOT_SIZE + QUADTREE_ROOT_SIZE / 2

				// Check if this root is within reasonable view distance
				const distX = centerPosition.x - rootX
				const distZ = centerPosition.z - rootZ
				const distSq = distX * distX + distZ * distZ

				if (distSq < QUADTREE_ROOT_SIZE * QUADTREE_ROOT_SIZE * 4) {
					const rootKey = `${rootX},${rootZ}`
					rootsNeeded.add(rootKey)

					// Create root if it doesn't exist
					if (!quadtreeRoots.current.has(rootKey)) {
						quadtreeRoots.current.set(rootKey, new QuadtreeNode(rootX, rootZ, QUADTREE_ROOT_SIZE, 0))
					}
				}
			}
		}

		// Remove roots that are too far away
		for (const [key] of quadtreeRoots.current) {
			if (!rootsNeeded.has(key)) {
				quadtreeRoots.current.delete(key)
			}
		}

		// Update all active quadtrees
		for (const [, root] of quadtreeRoots.current) {
			root.update(centerPosition.x, centerPosition.z, LOD_SPLIT_FACTOR, LOD_HYSTERESIS, QUADTREE_MIN_SIZE)
		}

		// Collect all leaf nodes from all roots
		const allLeaves = []
		const allNodes = new Map()

		for (const [, root] of quadtreeRoots.current) {
			root.collectLeaves(allLeaves, allNodes)
		}

		// Calculate edge stitching info for each leaf
		const tilesWithStitching = allLeaves.map((node) => ({
			node,
			edgeStitchInfo: getEdgeStitchInfo(node, allNodes, QUADTREE_MIN_SIZE),
			hasCollider: node.size === QUADTREE_MIN_SIZE, // Only smallest tiles get physics
		}))

		// Update state only if tiles actually changed
		setLeafTiles((prevTiles) => {
			// Quick check: if different length, definitely changed
			if (prevTiles.length !== tilesWithStitching.length) {
				return tilesWithStitching
			}

			// Check if any keys changed or edge stitching changed
			let hasChanges = false
			for (let i = 0; i < tilesWithStitching.length; i++) {
				const newTile = tilesWithStitching[i]
				const oldTile = prevTiles.find((t) => t.node.key === newTile.node.key)

				if (!oldTile) {
					hasChanges = true
					break
				}

				// Check if edge stitching changed
				const oldEdge = oldTile.edgeStitchInfo
				const newEdge = newTile.edgeStitchInfo
				if (
					oldEdge.north.needsStitch !== newEdge.north.needsStitch ||
					oldEdge.south.needsStitch !== newEdge.south.needsStitch ||
					oldEdge.east.needsStitch !== newEdge.east.needsStitch ||
					oldEdge.west.needsStitch !== newEdge.west.needsStitch ||
					oldEdge.north.neighborStep !== newEdge.north.neighborStep ||
					oldEdge.south.neighborStep !== newEdge.south.neighborStep ||
					oldEdge.east.neighborStep !== newEdge.east.neighborStep ||
					oldEdge.west.neighborStep !== newEdge.west.neighborStep
				) {
					hasChanges = true
					break
				}
			}

			return hasChanges ? tilesWithStitching : prevTiles
		})
	})

	return (
		<group name='Terrain'>
			{leafTiles.map(({ node, hasCollider, edgeStitchInfo }) => (
				<TerrainTile
					key={node.key}
					node={node}
					terrainHelpers={terrainHelpers}
					layerTextures={layerTextures}
					hasCollider={hasCollider}
					edgeStitchInfo={edgeStitchInfo || DEFAULT_EDGE_STITCH_INFO}
				/>
			))}
		</group>
	)
}

export default Terrain
