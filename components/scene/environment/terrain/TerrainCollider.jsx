import { useMemo, memo } from 'react'
import { RigidBody, HeightfieldCollider } from '@react-three/rapier'

import { TILE_RESOLUTION } from '../../../../config/terrain'

/**
 * TerrainCollider - Generates and renders a physics heightfield collider for a terrain tile.
 *
 * @param {Object} props
 * @param {Object} props.node - Quadtree node with centerX, centerZ, size, key
 * @param {Object} props.terrainHelpers - Height/normal sampling functions
 * @param {Array} props.position - [x, y, z] position for the RigidBody
 * @param {React.ReactNode} props.children - Child elements (terrain mesh)
 */
const TerrainCollider = memo(({ node, terrainHelpers, position, children }) => {
	const { size, centerX, centerZ } = node
	const { getNormalizedHeight, baseHeightScale } = terrainHelpers

	const colliderArgs = useMemo(() => {
		const segments = TILE_RESOLUTION
		const sampleCount = segments + 1
		const totalSamples = sampleCount * sampleCount
		const step = size / segments

		// Height samples for the collider (row-major order for Rapier)
		const heightSamples = new Array(totalSamples)

		// Generate height samples
		for (let i = 0; i < sampleCount; i++) {
			for (let j = 0; j < sampleCount; j++) {
				// Local coordinates within the terrain patch
				const localX = i * step
				const localZ = j * step

				// Convert to world coordinates
				const worldX = centerX + localX - size / 2
				const worldZ = centerZ + localZ - size / 2

				// Get normalized height
				const normalizedHeight = getNormalizedHeight(worldX, worldZ)

				// Store height sample in row-major order for Rapier collider
				const sampleIndex = i * sampleCount + j
				heightSamples[sampleIndex] = normalizedHeight
			}
		}

		// Build collider args in the format HeightfieldCollider expects
		return [
			segments, // nrows (cell count, NOT sample count)
			segments, // ncols (cell count, NOT sample count)
			heightSamples, // (segments+1)² samples in row-major order
			{ x: size, y: baseHeightScale, z: size },
		]
	}, [size, centerX, centerZ, terrainHelpers])

	return (
		<RigidBody type='fixed' position={position} colliders={false}>
			<HeightfieldCollider args={colliderArgs} name={`QTTile-${node.key}`} />
			{children}
		</RigidBody>
	)
})

export default TerrainCollider
