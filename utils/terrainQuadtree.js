// Terrain Quadtree LOD System
// Quadtree data structure for terrain level-of-detail management.
// Handles spatial subdivision, view-dependent refinement, and neighbor queries.

import { QUADTREE_ROOT_SIZE, TILE_RESOLUTION } from '../config/terrain'

/**
 * Represents a node in the terrain quadtree.
 * Each node covers a square region and can either:
 * - Render itself as a single tile (leaf)
 * - Subdivide into 4 child nodes (NW, NE, SW, SE)
 */
export class QuadtreeNode {
	/**
	 * @param {number} centerX - World X position of node center
	 * @param {number} centerZ - World Z position of node center
	 * @param {number} size - Width/height of this node's region
	 * @param {number} depth - How many levels down from root (0 = root)
	 */
	constructor(centerX, centerZ, size, depth = 0) {
		this.centerX = centerX
		this.centerZ = centerZ
		this.size = size
		this.depth = depth
		this.children = null // null = leaf node, array = subdivided

		// Unique key for React reconciliation
		this.key = `qt_${depth}_${Math.floor(centerX)}_${Math.floor(centerZ)}`
	}

	/**
	 * Check if this node should subdivide based on distance to viewer.
	 * Uses squared distance for performance.
	 */
	shouldSubdivide(viewerX, viewerZ, splitFactor, minSize) {
		// Don't subdivide if we're at minimum size
		if (this.size <= minSize) return false

		// Calculate distance from viewer to node center
		const dx = viewerX - this.centerX
		const dz = viewerZ - this.centerZ
		const distSq = dx * dx + dz * dz

		// Split threshold based on node size
		const splitDist = this.size * splitFactor
		const splitDistSq = splitDist * splitDist

		return distSq < splitDistSq
	}

	/**
	 * Check if this node should merge (stop subdividing).
	 * Uses hysteresis to prevent popping at boundaries.
	 */
	shouldMerge(viewerX, viewerZ, splitFactor, hysteresis) {
		const dx = viewerX - this.centerX
		const dz = viewerZ - this.centerZ
		const distSq = dx * dx + dz * dz

		// Merge threshold is further than split threshold
		const mergeDist = this.size * splitFactor * hysteresis
		const mergeDistSq = mergeDist * mergeDist

		return distSq > mergeDistSq
	}

	/**
	 * Subdivide this node into 4 children.
	 */
	subdivide() {
		const halfSize = this.size / 2
		const quarterSize = halfSize / 2
		const childDepth = this.depth + 1

		this.children = [
			// NW (negative X, positive Z)
			new QuadtreeNode(this.centerX - quarterSize, this.centerZ + quarterSize, halfSize, childDepth),
			// NE (positive X, positive Z)
			new QuadtreeNode(this.centerX + quarterSize, this.centerZ + quarterSize, halfSize, childDepth),
			// SW (negative X, negative Z)
			new QuadtreeNode(this.centerX - quarterSize, this.centerZ - quarterSize, halfSize, childDepth),
			// SE (positive X, negative Z)
			new QuadtreeNode(this.centerX + quarterSize, this.centerZ - quarterSize, halfSize, childDepth),
		]
	}

	/**
	 * Merge children back into this node (become a leaf).
	 */
	merge() {
		this.children = null
	}

	/**
	 * Update the quadtree based on viewer position.
	 * Recursively subdivides or merges nodes as needed.
	 */
	update(viewerX, viewerZ, splitFactor, hysteresis, minSize) {
		if (this.children) {
			// Already subdivided - check if we should merge
			if (this.shouldMerge(viewerX, viewerZ, splitFactor, hysteresis)) {
				this.merge()
			} else {
				// Update children recursively
				for (const child of this.children) {
					child.update(viewerX, viewerZ, splitFactor, hysteresis, minSize)
				}
			}
		} else {
			// Leaf node - check if we should subdivide
			if (this.shouldSubdivide(viewerX, viewerZ, splitFactor, minSize)) {
				this.subdivide()
				// Immediately update new children
				for (const child of this.children) {
					child.update(viewerX, viewerZ, splitFactor, hysteresis, minSize)
				}
			}
		}
	}

	/**
	 * Collect all leaf nodes (nodes that should render).
	 * Also registers all nodes in a spatial map for neighbor lookup.
	 */
	collectLeaves(leaves = [], allNodes = new Map()) {
		// Register this node in the spatial map for neighbor lookup
		allNodes.set(this.key, this)

		if (this.children) {
			// Not a leaf - collect from children
			for (const child of this.children) {
				child.collectLeaves(leaves, allNodes)
			}
		} else {
			// This is a leaf - add to render list
			leaves.push(this)
		}

		return { leaves, allNodes }
	}
}

/**
 * Get edge stitching info for a quadtree node.
 * Checks if neighboring nodes are at a coarser LOD level.
 *
 * In a quadtree, a neighbor at a coarser level means we need to
 * interpolate our edge vertices to match their grid to avoid cracks.
 *
 * @param {QuadtreeNode} node - The node to check
 * @param {Map} allNodes - Map of all nodes by key
 * @param {number} minSize - Minimum tile size
 * @returns {Object} Edge stitching info for each direction
 */
export const getEdgeStitchInfo = (node, allNodes, minSize) => {
	const edges = {
		north: { needsStitch: false, neighborStep: node.size / TILE_RESOLUTION },
		south: { needsStitch: false, neighborStep: node.size / TILE_RESOLUTION },
		east: { needsStitch: false, neighborStep: node.size / TILE_RESOLUTION },
		west: { needsStitch: false, neighborStep: node.size / TILE_RESOLUTION },
	}

	const halfSize = node.size / 2
	const probeOffset = 1 // Small offset outside our boundary

	// Probe points just outside each edge
	const probes = [
		{ edge: 'north', x: node.centerX, z: node.centerZ + halfSize + probeOffset },
		{ edge: 'south', x: node.centerX, z: node.centerZ - halfSize - probeOffset },
		{ edge: 'east', x: node.centerX + halfSize + probeOffset, z: node.centerZ },
		{ edge: 'west', x: node.centerX - halfSize - probeOffset, z: node.centerZ },
	]

	// Check each edge for coarser neighbors
	for (const { edge, x, z } of probes) {
		// Look for nodes at coarser levels (larger sizes) that contain this point
		let checkSize = node.size * 2

		while (checkSize <= QUADTREE_ROOT_SIZE) {
			// Calculate which node at this size would contain the probe point
			const nodeX = Math.floor(x / checkSize) * checkSize + checkSize / 2
			const nodeZ = Math.floor(z / checkSize) * checkSize + checkSize / 2
			const depth = Math.log2(QUADTREE_ROOT_SIZE / checkSize)
			const neighborKey = `qt_${depth}_${Math.floor(nodeX)}_${Math.floor(nodeZ)}`

			// Check if this coarser node exists and is a leaf
			const neighbor = allNodes.get(neighborKey)
			if (neighbor && !neighbor.children) {
				// Found a coarser leaf neighbor - we need to stitch
				edges[edge].needsStitch = true
				edges[edge].neighborStep = checkSize / TILE_RESOLUTION
				break
			}

			checkSize *= 2
		}
	}

	return edges
}

// Default edge stitch info (no stitching needed)
export const DEFAULT_EDGE_STITCH_INFO = {
	north: { needsStitch: false, neighborStep: 32 / TILE_RESOLUTION },
	south: { needsStitch: false, neighborStep: 32 / TILE_RESOLUTION },
	east: { needsStitch: false, neighborStep: 32 / TILE_RESOLUTION },
	west: { needsStitch: false, neighborStep: 32 / TILE_RESOLUTION },
}
