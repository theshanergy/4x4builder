import { useState, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import { QUADTREE_ROOT_SIZE, QUADTREE_MIN_SIZE, LOD_SPLIT_FACTOR, LOD_HYSTERESIS, MAX_QUADTREE_DEPTH } from '../config/lod'
import { QuadtreeNode, getEdgeStitchInfo } from '../utils/terrain/quadtree'

/**
 * Custom hook to manage quadtree LOD system
 * Handles root creation, updates, leaf collection, and edge stitching
 * LOD follows camera position (for drone camera, etc.)
 *
 * @returns {Array} Array of leaf tiles with node data and edge stitch info
 */
const useTerrainQuadtree = () => {
	const [leafTiles, setLeafTiles] = useState([])
	const lastUpdatePosition = useRef({ x: null, z: null })
	const quadtreeRoots = useRef(new Map())

	// Update quadtree based on camera position each frame
	useFrame(({ camera }) => {
		const centerPosition = camera.position

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
						quadtreeRoots.current.set(rootKey, new QuadtreeNode(rootX, rootZ, QUADTREE_ROOT_SIZE, MAX_QUADTREE_DEPTH))
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
		}))

		// Update state only if tiles actually changed
		setLeafTiles((prevTiles) => {
			// Quick check: if different length, definitely changed
			if (prevTiles.length !== tilesWithStitching.length) {
				return tilesWithStitching
			}

			// Build a Map from previous tiles for O(1) lookup instead of O(n) .find()
			const prevTileMap = new Map()
			for (let i = 0; i < prevTiles.length; i++) {
				prevTileMap.set(prevTiles[i].node.key, prevTiles[i])
			}

			// Check if any keys changed or edge stitching changed
			let hasChanges = false
			for (let i = 0; i < tilesWithStitching.length; i++) {
				const newTile = tilesWithStitching[i]
				const oldTile = prevTileMap.get(newTile.node.key)

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

	return leafTiles
}

export default useTerrainQuadtree
