import { useMemo, useEffect, memo } from 'react'
import { InstancedMesh } from 'three'

import { TREE_CONFIG } from '../../../../config/trees'
import useGameStore from '../../../../store/gameStore'
import { generateTreesForTile, getTreeLODForTileSize } from '../../../../utils/terrain/treeGeneration'

/**
 * Custom comparison for Trees props.
 * Prevents unnecessary re-renders when props haven't meaningfully changed.
 */
const arePropsEqual = (prevProps, nextProps) => {
	// Check node properties that affect tree placement
	if (
		prevProps.node.key !== nextProps.node.key ||
		prevProps.node.size !== nextProps.node.size ||
		prevProps.node.centerX !== nextProps.node.centerX ||
		prevProps.node.centerZ !== nextProps.node.centerZ
	) {
		return false
	}

	// Reference comparisons for objects that should be stable
	if (prevProps.terrainHelpers !== nextProps.terrainHelpers || prevProps.treeModels !== nextProps.treeModels) {
		return false
	}

	return true
}

/**
 * Trees - Renders instanced tree meshes for a terrain tile.
 *
 * @param {Object} props
 * @param {Object} props.node - Quadtree node with centerX, centerZ, size, key
 * @param {Object} props.terrainHelpers - Height/normal sampling functions
 * @param {Object} props.treeModels - Tree LOD models from useTreeModels
 */
const Trees = memo(({ node, terrainHelpers, treeModels }) => {
	// Check if trees should be disabled
	const isMobile = useGameStore((state) => state.isMobile)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const showTrees = !performanceDegraded && !isMobile

	// Generate tree instances for this tile
	const treeInstances = useMemo(() => {
		if (!treeModels || !showTrees || !terrainHelpers) return null

		// Determine LOD level based on tile size
		const lodLevel = getTreeLODForTileSize(node.size)
		const lodMeshes = treeModels[lodLevel]

		if (!lodMeshes || lodMeshes.length === 0) {
			console.warn(`[Trees] No meshes for LOD ${lodLevel}`)
			return null
		}

		// Generate tree matrices for this tile
		const treeMatrices = generateTreesForTile(node, terrainHelpers, lodLevel, TREE_CONFIG)

		if (treeMatrices.length === 0) {
			return null
		}

		console.log(`[Trees] Generated ${treeMatrices.length} trees for tile ${node.key} (size: ${node.size}, LOD: ${lodLevel}, meshes: ${lodMeshes.length})`)

		// Create instanced meshes for each tree part (trunk, leaves)
		const instances = lodMeshes.map((meshData) => {
			const instancedMesh = new InstancedMesh(meshData.geometry, meshData.material, treeMatrices.length)
			instancedMesh.castShadow = true
			instancedMesh.receiveShadow = true
			instancedMesh.frustumCulled = true

			// Set all matrices
			treeMatrices.forEach((matrix, i) => {
				instancedMesh.setMatrixAt(i, matrix)
			})
			instancedMesh.instanceMatrix.needsUpdate = true

			return instancedMesh
		})

		return instances
	}, [node.key, node.size, treeModels, terrainHelpers, showTrees])

	// Cleanup tree instances
	useEffect(() => {
		return () => {
			// Dispose instances when component unmounts or treeInstances change
			if (treeInstances) {
				treeInstances.forEach((mesh) => {
					// Note: Don't dispose geometry/material as they're shared from GLTF
					// Just let Three.js handle the cleanup
					mesh.dispose()
				})
			}
		}
	}, [treeInstances])

	// Trees are positioned in world space, not relative to tile
	return <>{treeInstances && treeInstances.map((mesh, index) => <primitive key={`tree-${node.key}-${index}`} object={mesh} />)}</>
}, arePropsEqual)

export default Trees
