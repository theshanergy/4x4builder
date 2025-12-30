import { useState, useRef, useMemo, useCallback } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Vector3, TextureLoader } from 'three'
import { Noise } from 'noisejs'

import useGameStore, { vehicleState } from '../../../../store/gameStore'

// Import terrain modules
import {
	OCEAN_RADIUS,
	QUADTREE_ROOT_SIZE,
	QUADTREE_MIN_SIZE,
	LOD_SPLIT_FACTOR,
	LOD_HYSTERESIS,
	DEFAULT_TERRAIN_CONFIG,
	WATER_LOAD_DISTANCE,
	WATER_UNLOAD_BUFFER,
	RIVER_CONFIG,
} from './config'
import { QuadtreeNode, getEdgeStitchInfo, DEFAULT_EDGE_STITCH_INFO } from './quadtree'
import { getDistanceToRiver } from './riverUtils'
import { createTerrainHelpers } from './heightSampler'

import TerrainTile from './TerrainTile'
import Grass from '../Grass'
import Water from '../Water'

/**
 * Terrain - Main terrain component with quadtree LOD.
 *
 * Features:
 * - Infinite procedural terrain using quadtree subdivision
 * - View-dependent level of detail with smooth transitions
 * - Edge stitching to prevent cracks between LOD levels
 * - Physics colliders on highest-detail tiles near player
 * - Dynamic water loading based on proximity
 * - Grass rendering (disabled on mobile/low performance)
 */
const Terrain = () => {
	const { smoothness, maxHeight } = DEFAULT_TERRAIN_CONFIG
	const [leafTiles, setLeafTiles] = useState([])
	const [showWater, setShowWater] = useState(false)
	const lastUpdatePosition = useRef({ x: null, z: null })

	// Quadtree roots - covers the entire terrain area
	// Multiple roots arranged in a grid for infinite terrain
	const quadtreeRoots = useRef(new Map())

	// Check if grass should be disabled
	const isMobile = useGameStore((state) => state.isMobile)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const showGrass = !performanceDegraded && !isMobile

	// Generate noise instance with fixed seed for consistency
	const noise = useMemo(() => new Noise(1234), [])

	// Load textures
	const [sandTexture, sandNormalMap] = useLoader(TextureLoader, ['/assets/images/ground/sand.jpg', '/assets/images/ground/sand_normal.jpg'])

	// Create shared terrain helpers (height/normal sampling)
	const terrainHelpers = useMemo(() => createTerrainHelpers(noise, smoothness), [noise, smoothness])

	// Scratch vector for normal calculations
	const normalScratch = useMemo(() => new Vector3(), [])

	// Public API: Get terrain height at any world position
	const getTerrainHeight = useCallback(
		(worldX, worldZ) => {
			return terrainHelpers.getHeight(worldX, worldZ, maxHeight)
		},
		[terrainHelpers, maxHeight]
	)

	// Public API: Get terrain normal at any world position
	const getTerrainNormal = useCallback(
		(worldX, worldZ, target = normalScratch) => {
			return terrainHelpers.getNormal(worldX, worldZ, maxHeight, target)
		},
		[terrainHelpers, maxHeight, normalScratch]
	)

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

		// Check if player is close enough to ocean OR in/near river to show water
		const distFromOrigin = Math.sqrt(centerPosition.x * centerPosition.x + centerPosition.z * centerPosition.z)
		const distFromOcean = OCEAN_RADIUS - distFromOrigin

		// Check distance to river
		const { distance: distToRiver, riverWidth } = getDistanceToRiver(centerPosition.x, centerPosition.z, noise)
		const nearRiver = distToRiver < riverWidth / 2 + RIVER_CONFIG.bankSlope + 50

		setShowWater((wasShowing) => {
			const nearOcean = wasShowing ? distFromOcean < WATER_LOAD_DISTANCE + WATER_UNLOAD_BUFFER : distFromOcean < WATER_LOAD_DISTANCE
			return nearOcean || nearRiver
		})
	})

	return (
		<group name='Terrain'>
			{showWater && <Water />}
			{leafTiles.map(({ node, hasCollider, edgeStitchInfo }) => (
				<TerrainTile
					key={node.key}
					node={node}
					maxHeight={maxHeight}
					terrainHelpers={terrainHelpers}
					map={sandTexture}
					normalMap={sandNormalMap}
					hasCollider={hasCollider}
					edgeStitchInfo={edgeStitchInfo || DEFAULT_EDGE_STITCH_INFO}
				/>
			))}
			{showGrass && <Grass getTerrainHeight={getTerrainHeight} getTerrainNormal={getTerrainNormal} />}
		</group>
	)
}

export default Terrain
