import { useMemo, useEffect, memo } from 'react'
import { InstancedMesh, Matrix4 } from 'three'

import useGameStore from '../../../../store/gameStore'
import { generateVegetationForType } from '../../../../utils/terrain/vegetationGeneration'

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

		const allInstances = []

		// Reusable scratch matrix for transform composition (performance optimization)
		const composedMatrix = new Matrix4()

		// Generate instances for each vegetation type
		vegetationModels.forEach((vegetationType, typeIndex) => {
			// Map quadtree LOD to vegetation LOD level:
			// Terrain LOD: 0 = smallest/closest tiles, higher = larger/farther tiles
			// Vegetation LOD: 0 = most detailed, 1 = medium, 2 = low detail

			// Get available LOD indices for this vegetation type
			const availableLods = Object.keys(vegetationType.lods)
				.map(Number)
				.sort((a, b) => a - b)
			const numLods = availableLods.length

			// Map node LOD directly to vegetation LOD (both 0 = highest detail)
			const lodLevel = availableLods[Math.min(numLods - 1, Math.max(0, node.lod))]

			const lodMeshes = vegetationType.lods[lodLevel]
			if (!lodMeshes?.length) return

			// Generate vegetation matrices for this type
			const vegetationMatrices = generateVegetationForType(node, terrainHelpers, lodLevel, vegetationType.config, typeIndex)

			if (vegetationMatrices.length === 0) {
				return
			}

			// Create instanced meshes for each part of this vegetation type (trunk, leaves, etc.)
			lodMeshes.forEach((meshData, meshIndex) => {
				const instancedMesh = new InstancedMesh(meshData.geometry, meshData.material, vegetationMatrices.length)
				instancedMesh.castShadow = true
				instancedMesh.receiveShadow = true
				instancedMesh.frustumCulled = true

				// Set all matrices, composing with the mesh's baked transform
				vegetationMatrices.forEach((matrix, i) => {
					// Compose: instance transform * mesh transform
					// This applies the mesh's local transform (position/rotation/scale from GLTF)
					// to each vegetation instance
					composedMatrix.multiplyMatrices(matrix, meshData.transform)
					instancedMesh.setMatrixAt(i, composedMatrix)
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
