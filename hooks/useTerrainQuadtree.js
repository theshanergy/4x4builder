import { useState, useRef, startTransition } from 'react'
import { useFrame } from '@react-three/fiber'

import { QUADTREE_ROOT_SIZE, QUADTREE_MIN_SIZE, LOD_SPLIT_FACTOR, LOD_HYSTERESIS, MAX_QUADTREE_DEPTH, QUADTREE_VIEW_RANGE } from '../config/lod'
import { QuadtreeNode, getEdgeStitchInfo } from '../utils/terrain/quadtree'
import { vehicleState } from '../store/gameStore'

/**
 * Custom hook to manage quadtree LOD system
 * Handles root creation, updates, leaf collection, and edge stitching
 * LOD follows camera position (for drone camera, etc.)
 * Uses React.startTransition to defer updates and avoid blocking vehicle rendering.
 *
 * @returns {Array} Array of leaf tiles with node data and edge stitch info
 */
const useTerrainQuadtree = () => {
	const [leafTiles, setLeafTiles] = useState([])
	const lastUpdatePosition = useRef({ x: null, z: null })
	const lastVehiclePosition = useRef({ x: null, z: null })
	const quadtreeRoots = useRef(new Map())
	const lastUpdateTime = useRef(0)

	// Update quadtree based on camera position each frame
	useFrame(({ camera, clock }) => {
		const centerPosition = camera.position
		const vehiclePos = vehicleState.position
		const currentTime = clock.getElapsedTime()
		const isFirstUpdate = lastUpdatePosition.current.x === null

		// Throttle updates more aggressively - update at most every 100ms
		// This ensures vehicle rendering stays smooth
		if (!isFirstUpdate && currentTime - lastUpdateTime.current < 0.1) {
			return
		}

		// Only update if camera or vehicle moved more than threshold since last update
		const updateThreshold = QUADTREE_MIN_SIZE

		// Calculate movement distance only if we have a previous position
		let cameraMoved = Infinity
		let vehicleMoved = Infinity
		if (!isFirstUpdate) {
			const dx = centerPosition.x - lastUpdatePosition.current.x
			const dz = centerPosition.z - lastUpdatePosition.current.z
			cameraMoved = Math.sqrt(dx * dx + dz * dz)
			const vdx = vehiclePos.x - lastVehiclePosition.current.x
			const vdz = vehiclePos.z - lastVehiclePosition.current.z
			vehicleMoved = Math.sqrt(vdx * vdx + vdz * vdz)
		}

		// Only update if: first update or either moved enough
		if (!isFirstUpdate && cameraMoved < updateThreshold && vehicleMoved < updateThreshold) {
			return
		}
		lastUpdatePosition.current.x = centerPosition.x
		lastUpdatePosition.current.z = centerPosition.z
		lastVehiclePosition.current.x = vehiclePos.x
		lastVehiclePosition.current.z = vehiclePos.z

		// Determine which quadtree roots we need based on player position
		const rootsNeeded = new Set()

		// Calculate the root tile the camera is currently in
		const centerRootX = Math.floor(centerPosition.x / QUADTREE_ROOT_SIZE)
		const centerRootZ = Math.floor(centerPosition.z / QUADTREE_ROOT_SIZE)

		// Generate roots in a circular pattern around the camera's current root
		for (let rx = -QUADTREE_VIEW_RANGE; rx <= QUADTREE_VIEW_RANGE; rx++) {
			for (let rz = -QUADTREE_VIEW_RANGE; rz <= QUADTREE_VIEW_RANGE; rz++) {
				// Skip tiles outside circular range
				if (rx * rx + rz * rz > QUADTREE_VIEW_RANGE * QUADTREE_VIEW_RANGE) continue

				// Calculate root tile coordinates
				const rootTileX = centerRootX + rx
				const rootTileZ = centerRootZ + rz

				// Convert tile coordinates to world center position
				const rootX = rootTileX * QUADTREE_ROOT_SIZE + QUADTREE_ROOT_SIZE / 2
				const rootZ = rootTileZ * QUADTREE_ROOT_SIZE + QUADTREE_ROOT_SIZE / 2

				// Mark this root as needed
				const rootKey = `${rootX},${rootZ}`
				rootsNeeded.add(rootKey)

				// Create root if it doesn't exist
				if (!quadtreeRoots.current.has(rootKey)) {
					quadtreeRoots.current.set(rootKey, new QuadtreeNode(rootX, rootZ, QUADTREE_ROOT_SIZE, MAX_QUADTREE_DEPTH))
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
			root.update(centerPosition.x, centerPosition.z, LOD_SPLIT_FACTOR, LOD_HYSTERESIS, QUADTREE_MIN_SIZE, vehiclePos.x, vehiclePos.z)
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

		// Mark this update time
		lastUpdateTime.current = currentTime

		// Update state only if tiles actually changed
		// Use startTransition to mark this as a non-urgent update
		// This allows React to prioritize vehicle rendering over terrain updates
		startTransition(() => {
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
	})

	return leafTiles
}

export default useTerrainQuadtree
