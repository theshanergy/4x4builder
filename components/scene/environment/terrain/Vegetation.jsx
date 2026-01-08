import { useMemo, useEffect, memo } from 'react'
import { InstancedMesh, Matrix4, Vector3, Quaternion } from 'three'
import { RigidBody, CylinderCollider } from '@react-three/rapier'

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
		const colliderData = []

		// Reusable scratch objects for transform composition and decomposition
		const composedMatrix = new Matrix4()
		const scratchPosition = new Vector3()
		const scratchQuaternion = new Quaternion()
		const scratchScale = new Vector3()

		// Generate instances for each vegetation type
		vegetationModels.forEach((vegetationType, typeIndex) => {
			// Map quadtree LOD to vegetation LOD level:
			// Terrain LOD: 0 = smallest/closest tiles, higher = larger/farther tiles
			// Vegetation LOD: 0 = most detailed, 1 = medium, 2 = low detail

			// Get available LOD levels for this vegetation type (sorted ascending)
			const availableLods = Object.keys(vegetationType.lods)
				.map(Number)
				.sort((a, b) => a - b)

			// Determine which LOD to use:
			// 1. If exact LOD exists, use it
			// 2. If node.lod is higher than highest available, use highest (for very distant terrain)
			// 3. If node.lod falls in a gap (e.g., lod2 is false but lod3 exists), don't render
			let actualLod = node.lod

			if (!vegetationType.lods[actualLod]) {
				// Exact LOD doesn't exist
				const maxAvailableLod = availableLods[availableLods.length - 1]

				if (node.lod > maxAvailableLod) {
					// Beyond highest available - use highest LOD for distant terrain
					actualLod = maxAvailableLod
				} else {
					// In a gap (explicit false cutoff) - don't render
					return
				}
			}

			const lodMeshes = vegetationType.lods[actualLod]
			if (!lodMeshes?.length) return

			// Check if this vegetation type should render at this LOD level
			if (vegetationType.config.maxLod !== undefined && actualLod > vegetationType.config.maxLod) {
				return // Beyond max LOD for this vegetation type
			}

			// Generate vegetation matrices for this type
			const vegetationMatrices = generateVegetationForType(node, terrainHelpers, actualLod, vegetationType.config, typeIndex)

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

			// Add colliders for LOD 0 tiles only
			// Decompose matrices here to avoid redundant work later
			if (node.lod === 0 && vegetationType.colliderGeometry) {
				vegetationMatrices.forEach((matrix) => {
					matrix.decompose(scratchPosition, scratchQuaternion, scratchScale)
					colliderData.push({
						geometry: vegetationType.colliderGeometry,
						position: [scratchPosition.x, scratchPosition.y, scratchPosition.z],
						quaternion: [scratchQuaternion.x, scratchQuaternion.y, scratchQuaternion.z, scratchQuaternion.w],
						scale: scratchScale.x, // Assume uniform scale
						typeIndex,
					})
				})
			}
		})

		return {
			instances: allInstances.length > 0 ? allInstances : null,
			colliders: colliderData.length > 0 ? colliderData : null,
		}
	}, [node.key, node.size, node.lod, vegetationModels, terrainHelpers, showVegetation])

	// Cleanup vegetation instances
	useEffect(() => {
		return () => {
			// Dispose instances when component unmounts or vegetationInstances change
			if (vegetationInstances?.instances) {
				vegetationInstances.instances.forEach(({ mesh }) => {
					// Note: Don't dispose geometry/material as they're shared from GLTF
					// Just let Three.js handle the cleanup
					mesh.dispose()
				})
			}
		}
	}, [vegetationInstances])

	// Vegetation is positioned in world space, not relative to tile
	return (
		<>
			{vegetationInstances?.instances &&
				vegetationInstances.instances.map(({ mesh, key }, index) => <primitive key={`vegetation-${node.key}-${key}-${index}`} object={mesh} />)}
			{vegetationInstances?.colliders &&
				vegetationInstances.colliders.map((collider, index) => (
					<RigidBody
						key={`${node.key}-collider-${collider.typeIndex}-${index}`}
						type='fixed'
						position={collider.position}
						quaternion={collider.quaternion}
						colliders={false}>
						<CylinderCollider args={[1.5 * collider.scale, 0.3 * collider.scale]} />
					</RigidBody>
				))}
		</>
	)
}, arePropsEqual)

export default Vegetation
