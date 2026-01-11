import { useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'

import { vehicleState } from '../../../../store/gameStore'
import { QUADTREE_MIN_SIZE, TILE_RESOLUTION } from '../../../../config/lod'

// Collider size and resolution
const SAMPLE_COUNT = TILE_RESOLUTION + 1
const STEP = QUADTREE_MIN_SIZE / TILE_RESOLUTION

// Update threshold - only regenerate heightmap when vehicle moves this far
const UPDATE_THRESHOLD = QUADTREE_MIN_SIZE / 2

/**
 * TerrainCollider - A single physics heightfield collider that follows the vehicle.
 * Decoupled from the visual LOD system so collisions work regardless of camera position.
 * Uses key-based re-creation since HeightfieldCollider doesn't support dynamic height updates.
 */
const TerrainCollider = ({ terrainHelpers }) => {
	const { getHeight } = terrainHelpers

	// Track current collider center position (snapped to grid)
	const [colliderCenter, setColliderCenter] = useState({ x: 0, z: 0 })

	// Generate height samples for the collider
	const colliderArgs = useMemo(() => {
		const { x: centerX, z: centerZ } = colliderCenter
		const halfSize = QUADTREE_MIN_SIZE / 2
		const heightSamples = []

		for (let i = 0; i < SAMPLE_COUNT; i++) {
			for (let j = 0; j < SAMPLE_COUNT; j++) {
				const localX = i * STEP
				const localZ = j * STEP
				const worldX = centerX + localX - halfSize
				const worldZ = centerZ + localZ - halfSize

				const height = getHeight(worldX, worldZ)
				heightSamples.push(height)
			}
		}

		// Scale parameter: size of the heightfield in world units
		// Heights are already in world space, so Y scale is simply the max expected height range
		return [TILE_RESOLUTION, TILE_RESOLUTION, heightSamples, { x: QUADTREE_MIN_SIZE, y: 1, z: QUADTREE_MIN_SIZE }]
	}, [colliderCenter, getHeight])

	// Update collider position based on vehicle position
	useFrame(() => {
		const { x, z } = vehicleState.position

		// Snap to grid to prevent constant updates
		const snappedX = Math.round(x / UPDATE_THRESHOLD) * UPDATE_THRESHOLD
		const snappedZ = Math.round(z / UPDATE_THRESHOLD) * UPDATE_THRESHOLD

		// Only update if we've moved to a new grid cell
		if (snappedX !== colliderCenter.x || snappedZ !== colliderCenter.z) {
			setColliderCenter({ x: snappedX, z: snappedZ })
		}
	})

	const colliderKey = `${colliderCenter.x},${colliderCenter.z}`

	return (
		<RigidBody key={colliderKey} type='fixed' position={[colliderCenter.x, 0, colliderCenter.z]} colliders={false}>
			<HeightfieldCollider args={colliderArgs} />
		</RigidBody>
	)
}

export default TerrainCollider
