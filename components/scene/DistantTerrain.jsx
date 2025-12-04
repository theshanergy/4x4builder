import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RingGeometry, Color, BufferAttribute, Vector3, RepeatWrapping } from 'three'

import useGameStore from '../../store/gameStore'

// Epsilon for numerical gradient approximation
const GRADIENT_EPSILON = 0.01

// Distant terrain configuration
const DISTANT_TERRAIN_CONFIG = {
	innerRadius: 150,
	outerRadius: 600,
	segments: 128,
	rings: 32,
	maxHeight: 50,
	baseHeight: -10,
	noiseScale: 0.008,
	peakSharpness: 2.5,
}

// Pre-computed colors for distant terrain (avoid creating in render)
const DISTANT_COLORS = {
	base: new Color(0xbea888),
	peak: new Color(0xdccbb3),
	shadow: new Color(0x8a7660),
}

// DistantTerrain component - creates a ring of distant mountains/dunes that follow the camera
const DistantTerrain = ({ noise, map }) => {
	const { innerRadius, outerRadius, segments, rings, maxHeight, baseHeight, noiseScale, peakSharpness } = DISTANT_TERRAIN_CONFIG
	const meshRef = useRef()

	useMemo(() => {
		if (map) {
			map.wrapS = map.wrapT = RepeatWrapping
			map.repeat.set(32, 32)
		}
	}, [map])

	// Helper to compute height at any position (for gradient calculation)
	const getDistantHeight = (x, z) => {
		const dist = Math.sqrt(x * x + z * z)
		if (dist < innerRadius || dist > outerRadius) return baseHeight

		const normalizedDist = (dist - innerRadius) / (outerRadius - innerRadius)

		const rawNoise =
			noise.perlin2(x * noiseScale, z * noiseScale) +
			noise.perlin2(x * noiseScale * 2, z * noiseScale * 2) * 0.5 +
			noise.perlin2(x * noiseScale * 4, z * noiseScale * 4) * 0.25
		const noiseValue = Math.pow((rawNoise + 1.75) / 3.5, peakSharpness)

		return baseHeight + noiseValue * maxHeight * Math.sin(normalizedDist * Math.PI)
	}

	const geometry = useMemo(() => {
		const geom = new RingGeometry(innerRadius, outerRadius, segments, rings)
		geom.rotateX(-Math.PI / 2)

		const positions = geom.getAttribute('position')
		const normals = geom.getAttribute('normal')
		const colors = new Float32Array(positions.count * 3)
		const normal = new Vector3()
		const tempColor = new Color() // Reusable color object

		for (let i = 0; i < positions.count; i++) {
			const x = positions.getX(i),
				z = positions.getZ(i)

			const height = getDistantHeight(x, z)
			positions.setY(i, height)

			// Compute normal analytically using finite differences
			const hL = getDistantHeight(x - GRADIENT_EPSILON, z)
			const hR = getDistantHeight(x + GRADIENT_EPSILON, z)
			const hD = getDistantHeight(x, z - GRADIENT_EPSILON)
			const hU = getDistantHeight(x, z + GRADIENT_EPSILON)

			const dhdx = (hR - hL) / (2 * GRADIENT_EPSILON)
			const dhdz = (hU - hD) / (2 * GRADIENT_EPSILON)
			normal.set(-dhdx, 1, -dhdz).normalize()

			normals.setXYZ(i, normal.x, normal.y, normal.z)

			// Height-based coloring using reusable color object
			const heightFactor = height / maxHeight
			const targetColor = heightFactor > 0.5 ? DISTANT_COLORS.peak : DISTANT_COLORS.shadow
			const lerpFactor = heightFactor > 0.5 ? (heightFactor - 0.5) * 2 : (0.5 - heightFactor) * 0.5
			tempColor.copy(DISTANT_COLORS.base).lerp(targetColor, lerpFactor)
			colors.set([tempColor.r, tempColor.g, tempColor.b], i * 3)
		}

		geom.setAttribute('color', new BufferAttribute(colors, 3))
		normals.needsUpdate = true
		return geom
	}, [innerRadius, outerRadius, segments, rings, noise, maxHeight, noiseScale, peakSharpness])

	useFrame(() => {
		const cameraTarget = useGameStore.getState().cameraTarget
		if (meshRef.current && cameraTarget) {
			meshRef.current.position.x = cameraTarget.x
			meshRef.current.position.z = cameraTarget.z
		}
	})

	return (
		<mesh ref={meshRef} geometry={geometry} receiveShadow>
			<meshStandardMaterial map={map} vertexColors roughness={0.9} metalness={0} />
		</mesh>
	)
}

export default DistantTerrain
