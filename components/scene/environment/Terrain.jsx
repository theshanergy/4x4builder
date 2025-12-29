import { useState, useRef, useMemo, useEffect, memo, useCallback } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'
import { RepeatWrapping, BufferGeometry, BufferAttribute, Vector3, TextureLoader } from 'three'
import { Noise } from 'noisejs'

import useGameStore, { vehicleState } from '../../../store/gameStore'
import useTerrainCollider from '../../../hooks/useTerrainCollider'

import Grass from './Grass'
import Water from './Water'

// Ocean configuration
const OCEAN_RADIUS = 5000
const OCEAN_TRANSITION = 300 // Width of the beach transition zone
const OCEAN_DEPTH = 12 // How far below 0 the ocean floor goes

// Beach profile control point (like a Bezier curve)
const BEACH_MIDPOINT_DEPTH = 0.2 // Intermediate depth at transition midpoint (0-1 range)

// Epsilon for numerical gradient approximation
const GRADIENT_EPSILON = 0.01

// Regional height modulation scale (size of flat/hilly regions)
const REGION_SCALE = 240

// Mountain configuration - realistic mountain generation
const MOUNTAIN_CONFIG = {
	// Distance from origin where mountains start to appear
	startRadius: 600,
	// Distance over which mountains blend in (transition zone)
	transitionWidth: 800,
	// Maximum mountain height
	maxHeight: 180,
	// Base noise scale for large mountain formations (smaller = more spread out)
	baseScale: 0.0008,
	// Ridge noise creates sharp mountain ridges (smaller = wider ridges)
	ridgeScale: 0.002,
	// Detail noise for smaller features
	detailScale: 0.008,
	// Domain warping scale for more natural shapes
	warpScale: 0.001,
	warpStrength: 150,
	// Valley carving - how much rivers/valleys cut into terrain
	valleyScale: 0.0015,
	valleyDepth: 0.5,
}

// ============================================================================
// QUADTREE TERRAIN CONFIGURATION
// ============================================================================
// The quadtree approach eliminates z-fighting by ensuring tiles never overlap.
// Each node either renders itself OR subdivides into 4 children, never both.
// This creates a hierarchical structure where LOD transitions are clean.

// Base size of the entire terrain quadtree (power of 2 recommended)
const QUADTREE_ROOT_SIZE = 4096

// Minimum tile size (highest detail level) - also determines physics tile size
const QUADTREE_MIN_SIZE = 32

// Maximum depth of quadtree (calculated from root/min sizes)
const QUADTREE_MAX_DEPTH = Math.log2(QUADTREE_ROOT_SIZE / QUADTREE_MIN_SIZE)

// Resolution (vertices per side) for each tile regardless of size
// Higher = more detail per tile, but more geometry
const TILE_RESOLUTION = 32

// LOD split threshold multiplier - a node splits when:
// distance < nodeSize * LOD_SPLIT_FACTOR
// Lower values = more aggressive LOD (less detail at distance)
// Higher values = more detail at distance (more tiles)
const LOD_SPLIT_FACTOR = 1.5

// Hysteresis factor to prevent tile popping at LOD boundaries
// A node won't merge back until distance > nodeSize * LOD_SPLIT_FACTOR * LOD_HYSTERESIS
const LOD_HYSTERESIS = 1.2

// Default terrain configuration
const DEFAULT_TERRAIN_CONFIG = {
	smoothness: 15,
	maxHeight: 4,
}

// Shared terrain height calculation utilities
const createTerrainHelpers = (noise, smoothness, flatAreaRadius, transitionEndDist) => {
	const flatAreaRadiusSq = flatAreaRadius * flatAreaRadius
	const transitionEndDistSq = transitionEndDist * transitionEndDist

	// Ocean boundary calculations
	const oceanTransitionStart = OCEAN_RADIUS - OCEAN_TRANSITION
	const oceanTransitionStartSq = oceanTransitionStart * oceanTransitionStart

	// Mountain transition calculations
	const mountainStartSq = MOUNTAIN_CONFIG.startRadius * MOUNTAIN_CONFIG.startRadius
	const mountainFullRadius = MOUNTAIN_CONFIG.startRadius + MOUNTAIN_CONFIG.transitionWidth
	const mountainFullRadiusSq = mountainFullRadius * mountainFullRadius

	// Ridge noise function - creates sharp mountain ridges
	// Uses absolute value of noise to create V-shaped valleys and ridges
	const getRidgeNoise = (x, z, scale) => {
		const n = noise.perlin2(x * scale, z * scale)
		// Invert absolute value to get ridges instead of valleys
		return 1 - Math.abs(n)
	}

	// Fractal Brownian Motion with ridged noise for mountains
	const getMountainNoise = (x, z) => {
		const { baseScale, ridgeScale, detailScale, warpScale, warpStrength, valleyScale, valleyDepth } = MOUNTAIN_CONFIG

		// Domain warping - displaces sample position for more organic shapes
		const warpX = noise.perlin2(x * warpScale + 50, z * warpScale + 50) * warpStrength
		const warpZ = noise.perlin2(x * warpScale + 150, z * warpScale + 150) * warpStrength
		const wx = x + warpX
		const wz = z + warpZ

		// Base large-scale mountain shapes
		const base = noise.perlin2(wx * baseScale, wz * baseScale) * 0.5 +
			noise.perlin2(wx * baseScale * 2.3, wz * baseScale * 2.3) * 0.25 +
			noise.perlin2(wx * baseScale * 5.1, wz * baseScale * 5.1) * 0.125

		// Ridge noise for sharp peaks
		const ridge1 = getRidgeNoise(wx, wz, ridgeScale)
		const ridge2 = getRidgeNoise(wx + 100, wz + 100, ridgeScale * 1.7)
		const ridges = ridge1 * ridge1 * 0.6 + ridge2 * ridge2 * 0.4

		// Combine base and ridges
		let height = (base + 0.5) * 0.4 + ridges * 0.6

		// Apply valley carving - creates river-like valleys
		const valleyNoise = noise.perlin2(x * valleyScale + 200, z * valleyScale + 200)
		const valleyFactor = Math.max(0, valleyNoise) * valleyDepth
		height = height * (1 - valleyFactor * 0.5)

		// Add fine detail
		const detail = noise.perlin2(wx * detailScale, wz * detailScale) * 0.1 +
			noise.perlin2(wx * detailScale * 2.1, wz * detailScale * 2.1) * 0.05

		height += detail

		// Ensure positive and apply power curve for more dramatic peaks
		height = Math.max(0, height)
		height = Math.pow(height, 1.3)

		return height
	}

	// Get raw height value at any world position (normalized 0-1, can go negative for ocean)
	const getRawHeight = (worldX, worldZ) => {
		const distSq = worldX * worldX + worldZ * worldZ
		const dist = Math.sqrt(distSq)

		// Start with flat area check
		if (distSq < flatAreaRadiusSq) return 0

		// Calculate base terrain noise (existing gentle terrain)
		const noiseValue = noise.perlin2(worldX / smoothness, worldZ / smoothness)
		const normalizedHeight = (noiseValue + 1) / 2

		// Regional height modulation - creates dispersed flatter areas
		const regionNoise = noise.perlin2(worldX / REGION_SCALE + 100, worldZ / REGION_SCALE + 100)
		// Map to 0.1-1.0 range: some areas have 10% height (much flatter), others full height
		const regionModifier = 0.1 + (regionNoise + 1) * 0.45

		let baseHeight
		if (distSq < transitionEndDistSq) {
			const t = (dist - flatAreaRadius) / (transitionEndDist - flatAreaRadius)
			baseHeight = normalizedHeight * (t * t * (3 - 2 * t)) * regionModifier
		} else {
			baseHeight = normalizedHeight * regionModifier
		}

		// Add mountain height if we're far enough from center
		let mountainHeight = 0
		if (distSq > mountainStartSq && dist < OCEAN_RADIUS - OCEAN_TRANSITION * 0.5) {
			// Calculate blend factor for mountains
			let mountainBlend = 1
			if (distSq < mountainFullRadiusSq) {
				// In transition zone - smooth blend in
				const t = (dist - MOUNTAIN_CONFIG.startRadius) / MOUNTAIN_CONFIG.transitionWidth
				// Use smoothstep for natural transition
				mountainBlend = t * t * (3 - 2 * t)
			}

			// Reduce mountains near ocean to create beaches
			const oceanProximity = (OCEAN_RADIUS - OCEAN_TRANSITION * 2 - dist) / (OCEAN_TRANSITION * 3)
			const oceanFade = Math.min(1, Math.max(0, oceanProximity))

			// Get mountain noise and apply blend
			const rawMountainHeight = getMountainNoise(worldX, worldZ)
			// Scale to normalized units (will be multiplied by maxHeight later)
			mountainHeight = rawMountainHeight * (MOUNTAIN_CONFIG.maxHeight / 4) * mountainBlend * oceanFade
		}

		// Combine base terrain with mountains
		// Base terrain is scaled down in mountain areas to let mountains dominate
		const mountainInfluence = mountainHeight > 0 ? Math.min(1, mountainHeight * 0.5) : 0
		const combinedHeight = baseHeight * (1 - mountainInfluence * 0.7) + mountainHeight

		// Apply ocean tapering - realistic two-stage beach profile
		if (distSq > oceanTransitionStartSq) {
			if (dist >= OCEAN_RADIUS) {
				// Beyond ocean radius - full ocean depth (normalized)
				return -OCEAN_DEPTH / 4 // Normalize relative to typical maxHeight
			} else {
				// In transition zone - smooth bezier-like curve through control point
				const t = (dist - oceanTransitionStart) / OCEAN_TRANSITION // 0 at shore, 1 at deep ocean

				const oceanFloorHeight = -OCEAN_DEPTH / 4
				const midpointHeight = oceanFloorHeight * BEACH_MIDPOINT_DEPTH

				// Quadratic bezier interpolation: start at combinedHeight, through midpoint, to oceanFloorHeight
				const bezierT = t * t * (3 - 2 * t) // Smoothstep for natural curve
				let finalHeight

				if (t < 0.5) {
					// Shallow beach section
					const localT = t * 2 // Map to 0-1
					finalHeight = combinedHeight * (1 - localT) + midpointHeight * localT
				} else {
					// Drop-off section
					const localT = (t - 0.5) * 2 // Map to 0-1
					const dropCurve = localT * localT // Quadratic for steeper descent
					finalHeight = midpointHeight * (1 - dropCurve) + oceanFloorHeight * dropCurve
				}

				// Suppress terrain noise as we enter water
				const noiseSuppression = (1 - bezierT) * (1 - bezierT) * (1 - bezierT)
				return combinedHeight * noiseSuppression + finalHeight * (1 - noiseSuppression)
			}
		}

		return combinedHeight
	}

	// Get terrain height at any world position (in world units)
	const getHeight = (worldX, worldZ, maxHeight) => {
		return getRawHeight(worldX, worldZ) * maxHeight
	}

	// Get terrain normal at any world position
	const getNormal = (worldX, worldZ, maxHeight, target) => {
		// Use larger epsilon for distant terrain to avoid noise artifacts
		const dist = Math.sqrt(worldX * worldX + worldZ * worldZ)
		const epsilon = dist > 500 ? GRADIENT_EPSILON * 4 : GRADIENT_EPSILON

		const hL = getRawHeight(worldX - epsilon, worldZ) * maxHeight
		const hR = getRawHeight(worldX + epsilon, worldZ) * maxHeight
		const hD = getRawHeight(worldX, worldZ - epsilon) * maxHeight
		const hU = getRawHeight(worldX, worldZ + epsilon) * maxHeight

		const dhdx = (hR - hL) / (2 * epsilon)
		const dhdz = (hU - hD) / (2 * epsilon)

		return target.set(-dhdx, 1, -dhdz).normalize()
	}

	return { getRawHeight, getHeight, getNormal }
}

// ============================================================================
// QUADTREE NODE LOGIC
// ============================================================================

/**
 * Represents a node in the terrain quadtree.
 * Each node covers a square region and can either:
 * - Render itself as a single tile
 * - Subdivide into 4 child nodes (NW, NE, SW, SE)
 *
 * Key properties:
 * - centerX, centerZ: World position of node center
 * - size: Width/height of this node's region
 * - depth: How many levels down from root (0 = root, max = leaf)
 */
class QuadtreeNode {
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
	 * Also collects neighbor info for edge stitching.
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
 * interpolate our edge vertices to match their grid.
 */
const getQuadtreeEdgeStitchInfo = (node, allNodes, minSize) => {
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

/**
 * Create geometry for a quadtree terrain tile.
 * Handles edge stitching to prevent cracks between LOD levels.
 */
const createQuadtreeGeometry = (node, maxHeight, terrainHelpers, edgeStitchInfo) => {
	const { size, centerX, centerZ } = node
	const resolution = TILE_RESOLUTION
	const segments = resolution
	const sampleCount = segments + 1
	const totalSamples = sampleCount * sampleCount
	const step = size / segments
	const halfSize = size / 2
	const originX = centerX - halfSize
	const originZ = centerZ - halfSize

	const positions = new Float32Array(totalSamples * 3)
	const normals = new Float32Array(totalSamples * 3)
	const uvs = new Float32Array(totalSamples * 2)

	const normalVec = new Vector3()

	// Interpolated height for stitched edges
	const getStitchedHeight = (worldX, worldZ, neighborStep, axis) => {
		if (axis === 'x') {
			const gridX = worldX / neighborStep
			const x0 = Math.floor(gridX) * neighborStep
			const x1 = x0 + neighborStep
			const t = (worldX - x0) / neighborStep

			const h0 = terrainHelpers.getRawHeight(x0, worldZ)
			const h1 = terrainHelpers.getRawHeight(x1, worldZ)
			return (h0 * (1 - t) + h1 * t) * maxHeight
		} else {
			const gridZ = worldZ / neighborStep
			const z0 = Math.floor(gridZ) * neighborStep
			const z1 = z0 + neighborStep
			const t = (worldZ - z0) / neighborStep

			const h0 = terrainHelpers.getRawHeight(worldX, z0)
			const h1 = terrainHelpers.getRawHeight(worldX, z1)
			return (h0 * (1 - t) + h1 * t) * maxHeight
		}
	}

	// Generate vertices
	for (let i = 0; i < sampleCount; i++) {
		const localX = i * step
		const worldX = originX + localX
		const onWestEdge = i === 0
		const onEastEdge = i === segments

		for (let j = 0; j < sampleCount; j++) {
			const localZ = j * step
			const worldZ = originZ + localZ
			const onSouthEdge = j === 0
			const onNorthEdge = j === segments

			let height

			// Apply edge stitching
			if (onWestEdge && edgeStitchInfo.west.needsStitch) {
				height = getStitchedHeight(worldX, worldZ, edgeStitchInfo.west.neighborStep, 'z')
			} else if (onEastEdge && edgeStitchInfo.east.needsStitch) {
				height = getStitchedHeight(worldX, worldZ, edgeStitchInfo.east.neighborStep, 'z')
			} else if (onSouthEdge && edgeStitchInfo.south.needsStitch) {
				height = getStitchedHeight(worldX, worldZ, edgeStitchInfo.south.neighborStep, 'x')
			} else if (onNorthEdge && edgeStitchInfo.north.needsStitch) {
				height = getStitchedHeight(worldX, worldZ, edgeStitchInfo.north.neighborStep, 'x')
			} else {
				height = terrainHelpers.getRawHeight(worldX, worldZ) * maxHeight
			}

			const vertIndex = i + sampleCount * j
			const posIndex = vertIndex * 3
			const uvIndex = vertIndex * 2

			// Position centered on node
			positions[posIndex] = localX - halfSize
			positions[posIndex + 1] = height
			positions[posIndex + 2] = localZ - halfSize

			// Normal
			terrainHelpers.getNormal(worldX, worldZ, maxHeight, normalVec)
			normals[posIndex] = normalVec.x
			normals[posIndex + 1] = normalVec.y
			normals[posIndex + 2] = normalVec.z

			// UVs in world space for seamless texturing
			uvs[uvIndex] = worldX
			uvs[uvIndex + 1] = worldZ
		}
	}

	// Build indices for the grid
	const indices = []
	for (let i = 0; i < segments; i++) {
		for (let j = 0; j < segments; j++) {
			const a = i + sampleCount * j
			const b = i + 1 + sampleCount * j
			const c = i + sampleCount * (j + 1)
			const d = i + 1 + sampleCount * (j + 1)

			// Two triangles per quad
			indices.push(a, c, b)
			indices.push(b, c, d)
		}
	}

	// Build geometry directly without PlaneGeometry overhead
	const geom = new BufferGeometry()
	geom.setAttribute('position', new BufferAttribute(positions, 3))
	geom.setAttribute('normal', new BufferAttribute(normals, 3))
	geom.setAttribute('uv', new BufferAttribute(uvs, 2))
	geom.setIndex(indices)

	return geom
}

// Custom comparison for QuadtreeTerrainTile
const areQuadtreeTilePropsEqual = (prevProps, nextProps) => {
	// Node comparison - check key
	if (prevProps.node.key !== nextProps.node.key) return false

	// Check node properties that affect rendering
	if (prevProps.node.size !== nextProps.node.size || prevProps.node.centerX !== nextProps.node.centerX || prevProps.node.centerZ !== nextProps.node.centerZ) {
		return false
	}

	// Simple value comparisons
	if (prevProps.maxHeight !== nextProps.maxHeight || prevProps.hasCollider !== nextProps.hasCollider) {
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

// QuadtreeTerrainTile component - renders a single quadtree leaf node
const QuadtreeTerrainTile = memo(({ node, maxHeight, terrainHelpers, map, normalMap, hasCollider = false, edgeStitchInfo }) => {
	const materialRef = useRef()

	// Apply texture settings
	useMemo(() => {
		if (map) {
			map.wrapS = map.wrapT = RepeatWrapping
			map.repeat.set(1, 1)
		}
		if (normalMap) {
			normalMap.wrapS = normalMap.wrapT = RepeatWrapping
			normalMap.repeat.set(0.33, 0.33)
		}
	}, [map, normalMap])

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
			return terrainHelpers.getNormal(worldX, worldZ, maxHeight, target)
		},
		[centerX, centerZ, size, maxHeight, terrainHelpers]
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
					maxHeight,
					getHeight,
					getNormal,
					getUV,
				}
			: { segments: 1, size: 1, maxHeight: 1, getHeight: () => 0, getNormal: null, getUV: null }
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
		return createQuadtreeGeometry(node, maxHeight, terrainHelpers, edgeStitchInfo)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [node.key, maxHeight, terrainHelpers, edgeStitchKey])

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
					<meshStandardMaterial ref={materialRef} map={map} normalMap={normalMap} />
				</mesh>
			</RigidBody>
		)
	}

	return (
		<mesh geometry={geometry} position={position} receiveShadow>
			<meshStandardMaterial ref={materialRef} map={map} normalMap={normalMap} />
		</mesh>
	)
}, areQuadtreeTilePropsEqual)

// Distance from ocean edge at which water starts loading (with hysteresis buffer)
const WATER_LOAD_DISTANCE = 1500 // Start loading water when this close to ocean edge
const WATER_UNLOAD_BUFFER = 400 // Extra distance before unloading to prevent flicker

// Default edge stitch info (no stitching needed)
// neighborStep value doesn't matter when needsStitch is false, but use a sensible default
const DEFAULT_EDGE_STITCH_INFO = {
	north: { needsStitch: false, neighborStep: QUADTREE_MIN_SIZE / TILE_RESOLUTION },
	south: { needsStitch: false, neighborStep: QUADTREE_MIN_SIZE / TILE_RESOLUTION },
	east: { needsStitch: false, neighborStep: QUADTREE_MIN_SIZE / TILE_RESOLUTION },
	west: { needsStitch: false, neighborStep: QUADTREE_MIN_SIZE / TILE_RESOLUTION },
}

// Main Terrain component using quadtree LOD system
const Terrain = () => {
	const { smoothness, maxHeight } = DEFAULT_TERRAIN_CONFIG
	const [leafTiles, setLeafTiles] = useState([])
	const [showWater, setShowWater] = useState(false)
	const lastUpdatePosition = useRef({ x: null, z: null })

	// Quadtree root - covers the entire terrain area
	// We use multiple roots arranged in a grid to cover infinite terrain
	const quadtreeRoots = useRef(new Map())

	// Check if grass should be disabled
	const isMobile = useGameStore((state) => state.isMobile)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const showGrass = !performanceDegraded && !isMobile

	// Generate noise instance
	const noise = useMemo(() => new Noise(1234), [])

	const [sandTexture, sandNormalMap] = useLoader(TextureLoader, ['/assets/images/ground/sand.jpg', '/assets/images/ground/sand_normal.jpg'])

	// Flat area and transition parameters
	const flatAreaRadius = QUADTREE_MIN_SIZE * 0.5
	const transitionEndDist = QUADTREE_MIN_SIZE * 2

	// Create shared terrain helpers
	const terrainHelpers = useMemo(() => createTerrainHelpers(noise, smoothness, flatAreaRadius, transitionEndDist), [noise, smoothness, flatAreaRadius, transitionEndDist])

	// Scratch vector for normal calculations
	const normalScratch = useMemo(() => new Vector3(), [])

	// Get terrain height at any world position
	const getTerrainHeight = useCallback(
		(worldX, worldZ) => {
			return terrainHelpers.getHeight(worldX, worldZ, maxHeight)
		},
		[terrainHelpers, maxHeight]
	)

	// Get terrain normal at any world position
	const getTerrainNormal = useCallback(
		(worldX, worldZ, target = normalScratch) => {
			return terrainHelpers.getNormal(worldX, worldZ, maxHeight, target)
		},
		[terrainHelpers, maxHeight, normalScratch]
	)

	// Update quadtree based on vehicle position
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
		// Each root covers QUADTREE_ROOT_SIZE area
		const rootsNeeded = new Set()
		const viewRange = QUADTREE_ROOT_SIZE * 2 // How far to look for roots

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
			edgeStitchInfo: getQuadtreeEdgeStitchInfo(node, allNodes, QUADTREE_MIN_SIZE),
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

				// Check if edge stitching changed (both needsStitch and neighborStep)
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

		// Check if player is close enough to ocean to show water
		const distFromOrigin = Math.sqrt(centerPosition.x * centerPosition.x + centerPosition.z * centerPosition.z)
		const distFromOcean = OCEAN_RADIUS - distFromOrigin

		setShowWater((wasShowing) => {
			if (wasShowing) {
				return distFromOcean < WATER_LOAD_DISTANCE + WATER_UNLOAD_BUFFER
			} else {
				return distFromOcean < WATER_LOAD_DISTANCE
			}
		})
	})

	return (
		<group name='Terrain'>
			{showWater && <Water oceanRadius={OCEAN_RADIUS} oceanTransition={OCEAN_TRANSITION} />}
			{leafTiles.map(({ node, hasCollider, edgeStitchInfo }) => (
				<QuadtreeTerrainTile
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
