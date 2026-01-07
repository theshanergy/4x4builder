import { useMemo, useEffect, memo } from 'react'
import { InstancedMesh } from 'three'

import { VEGETATION_SETTINGS } from '../../../../config/vegetation'
import useGameStore from '../../../../store/gameStore'
import { generateVegetationForType, getVegetationLODForTileSize } from '../../../../utils/terrain/vegetationGeneration'

/**
 * Custom comparison for Vegetation props.
 * Prevents unnecessary re-renders when props haven't meaningfully changed.
 */
const arePropsEqual = (prevProps, nextProps) => {
	// Check node properties that affect vegetation placement
	if (
		prevProps.node.key !== nextProps.node.key ||
		prevProps.node.size !== nextProps.node.size ||
		prevProps.node.centerX !== nextProps.node.centerX ||
		prevProps.node.centerZ !== nextProps.node.centerZ
	) {
		return false
	}

	// Reference comparisons for objects that should be stable
	if (prevProps.terrainHelpers !== nextProps.terrainHelpers || prevProps.vegetationModels !== nextProps.vegetationModels) {
		return false
	}

	return true
}

/**
 * Vegetation - Renders instanced vegetation meshes for a terrain tile.
 *
 * @param {Object} props
 * @param {Object} props.node - Quadtree node with centerX, centerZ, size, key
 * @param {Object} props.terrainHelpers - Height/normal sampling functions
 * @param {Array} props.vegetationModels - Array of vegetation type models from useVegetationModels
 */
const Vegetation = memo(({ node, terrainHelpers, vegetationModels }) => {
	// Check if vegetation should be disabled
	const isMobile = useGameStore((state) => state.isMobile)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const showVegetation = !performanceDegraded && !isMobile

	// Generate vegetation instances for this tile
	const vegetationInstances = useMemo(() => {
		if (!vegetationModels || !showVegetation || !terrainHelpers) return null

		// Determine LOD level based on tile size
		const lodLevel = getVegetationLODForTileSize(node.size)

		const allInstances = []

		// Generate instances for each vegetation type
		vegetationModels.forEach((vegetationType, typeIndex) => {
			const lodMeshes = vegetationType.lods[lodLevel]

			if (!lodMeshes || lodMeshes.length === 0) {
				console.warn(`[Vegetation] No meshes for ${vegetationType.name} LOD ${lodLevel}`)
				return
			}

			// Generate vegetation matrices for this type
			const vegetationMatrices = generateVegetationForType(node, terrainHelpers, lodLevel, vegetationType.config, VEGETATION_SETTINGS, typeIndex)

			if (vegetationMatrices.length === 0) {
				return
			}

			// Create instanced meshes for each part of this vegetation type (trunk, leaves, etc.)
			lodMeshes.forEach((meshData, meshIndex) => {
				const instancedMesh = new InstancedMesh(meshData.geometry, meshData.material, vegetationMatrices.length)
				instancedMesh.castShadow = true
				instancedMesh.receiveShadow = true
				instancedMesh.frustumCulled = true

				// Set all matrices
				vegetationMatrices.forEach((matrix, i) => {
					instancedMesh.setMatrixAt(i, matrix)
				})
				instancedMesh.instanceMatrix.needsUpdate = true

				allInstances.push({
					mesh: instancedMesh,
					key: `${vegetationType.name}-${meshIndex}`,
				})
			})
		})

		return allInstances.length > 0 ? allInstances : null
	}, [node.key, node.size, vegetationModels, terrainHelpers, showVegetation])

	// Cleanup vegetation instances
	useEffect(() => {
		return () => {
			// Dispose instances when component unmounts or vegetationInstances change
			if (vegetationInstances) {
				vegetationInstances.forEach(({ mesh }) => {
					// Note: Don't dispose geometry/material as they're shared from GLTF
					// Just let Three.js handle the cleanup
					mesh.dispose()
				})
			}
		}
	}, [vegetationInstances])

	// Vegetation is positioned in world space, not relative to tile
	return <>{vegetationInstances && vegetationInstances.map(({ mesh, key }, index) => <primitive key={`vegetation-${node.key}-${key}-${index}`} object={mesh} />)}</>
}, arePropsEqual)

export default Vegetation
