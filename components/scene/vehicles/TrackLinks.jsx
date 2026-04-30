import { memo, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'

const SIDES = ['L', 'R']
const DEFAULT_LINK_WIDTH = 0.45
const DEFAULT_LINK_LENGTH = 0.18
const DEFAULT_LINK_HEIGHT = 0.08
const DEFAULT_TRACK_DEPTH = 0.08
const DEFAULT_MAX_LINKS_PER_SIDE = 96
const DEFAULT_SAMPLES_PER_WHEEL = 64
const FORWARD_VECTOR = new Vector3(0, 0, 1)
const INCHES_TO_METERS = 0.0254

const cross = (origin, a, b) => (a.z - origin.z) * (b.y - origin.y) - (a.y - origin.y) * (b.z - origin.z)

const convexHull = (points) => {
	if (points.length <= 3) return points

	const sorted = [...points].sort((a, b) => a.z - b.z || a.y - b.y)
	const lower = []
	for (const point of sorted) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
			lower.pop()
		}
		lower.push(point)
	}

	const upper = []
	for (let i = sorted.length - 1; i >= 0; i--) {
		const point = sorted[i]
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
			upper.pop()
		}
		upper.push(point)
	}

	lower.pop()
	upper.pop()
	return lower.concat(upper)
}

const getPathMetrics = (path) => {
	const lengths = []
	let total = 0

	for (let i = 0; i < path.length; i++) {
		const start = path[i]
		const end = path[(i + 1) % path.length]
		const dz = end.z - start.z
		const dy = end.y - start.y
		const length = Math.sqrt(dz * dz + dy * dy)
		lengths.push(length)
		total += length
	}

	return { lengths, total }
}

const pointAtDistance = (path, lengths, distance) => {
	let remaining = distance

	for (let i = 0; i < path.length; i++) {
		const length = lengths[i]
		if (length <= 0) continue

		if (remaining <= length) {
			const start = path[i]
			const end = path[(i + 1) % path.length]
			const t = remaining / length
			return {
				y: start.y + (end.y - start.y) * t,
				z: start.z + (end.z - start.z) * t,
			}
		}

		remaining -= length
	}

	return {
		y: path[0].y,
		z: path[0].z,
	}
}

const modDistance = (distance, total) => {
	if (total <= 0) return 0
	return ((distance % total) + total) % total
}

const TrackLinks = memo(({ trackConfig, wheelPositions, wheelRefs, physicsWheelPositions, vehicleController }) => {
	const meshRef = useRef()

	const linkWidth = useMemo(() => {
		const widestWheel = wheelPositions.reduce((widest, wheel) => {
			if (!wheel.isTrackWheel) return widest
			return Math.max(widest, wheel.rim_width || 0)
		}, 0)
		return widestWheel > 0 ? widestWheel * INCHES_TO_METERS : DEFAULT_LINK_WIDTH
	}, [wheelPositions])
	const linkLength = trackConfig?.link_length || DEFAULT_LINK_LENGTH
	const linkHeight = trackConfig?.link_height || DEFAULT_LINK_HEIGHT
	const trackDepth = trackConfig?.track_depth ?? linkHeight ?? DEFAULT_TRACK_DEPTH
	const maxLinksPerSide = trackConfig?.max_links_per_side || DEFAULT_MAX_LINKS_PER_SIDE
	const samplesPerWheel = trackConfig?.samples_per_wheel || DEFAULT_SAMPLES_PER_WHEEL
	const maxInstanceCount = maxLinksPerSide * SIDES.length

	const geometry = useMemo(() => new BoxGeometry(linkWidth, linkHeight, linkLength), [linkWidth, linkHeight, linkLength])
	const material = useMemo(() => new MeshStandardMaterial({ color: '#161616', roughness: 0.85, metalness: 0.1 }), [])

	const trackWheelsBySide = useMemo(() => {
		const groups = { L: [], R: [] }
		for (const wheel of wheelPositions) {
			if (!wheel.isTrackWheel) continue
			const side = wheel.side || (wheel.position[0] >= 0 ? 'L' : 'R')
			groups[side].push(wheel)
		}
		return groups
	}, [wheelPositions])

	const physicsWheelsBySide = useMemo(() => {
		const groups = { L: [], R: [] }
		physicsWheelPositions.forEach((wheel, physicsIndex) => {
			const side = wheel.side || (wheel.position[0] >= 0 ? 'L' : 'R')
			groups[side].push({ ...wheel, physicsIndex })
		})
		return groups
	}, [physicsWheelPositions])

	const tempMatrix = useMemo(() => new Matrix4(), [])
	const tempPosition = useMemo(() => new Vector3(), [])
	const tempQuaternion = useMemo(() => new Quaternion(), [])
	const tempDirection = useMemo(() => new Vector3(), [])
	const tempScale = useMemo(() => new Vector3(1, 1, 1), [])

	const getTrackPhase = (side, perimeter) => {
		const controller = vehicleController?.current
		if (!controller || perimeter <= 0) return 0

		const wheels = physicsWheelsBySide[side]
		let distance = 0
		let count = 0

		for (const wheel of wheels) {
			try {
				distance += (controller.wheelRotation(wheel.physicsIndex) || 0) * (wheel.physicsRadius || wheel.radius || 0.35)
				count++
			} catch {
				return 0
			}
		}

		return count > 0 ? modDistance(-distance / count, perimeter) : 0
	}

	useFrame(() => {
		const mesh = meshRef.current
		if (!mesh) return

		let instanceIndex = 0

		for (const side of SIDES) {
			const sideWheels = trackWheelsBySide[side]
			if (!sideWheels || sideWheels.length < 2) continue

			const samples = []
			let sideX = 0
			let sideXCount = 0

			for (const wheel of sideWheels) {
				const wheelRef = wheelRefs[wheel.visualIndex]?.current
				const position = wheelRef?.position || { x: wheel.position[0], y: wheel.position[1], z: wheel.position[2] }
				const radius = (wheel.radius || 0.35) + trackDepth * 0.5
				sideX += position.x
				sideXCount++

				for (let sample = 0; sample < samplesPerWheel; sample++) {
					const angle = (sample / samplesPerWheel) * Math.PI * 2
					samples.push({
						y: position.y + Math.sin(angle) * radius,
						z: position.z + Math.cos(angle) * radius,
					})
				}
			}

			sideX /= Math.max(sideXCount, 1)

			const path = convexHull(samples)
			if (path.length < 3) continue

			const { lengths, total } = getPathMetrics(path)
			if (total <= 0) continue

			const linkCount = Math.min(maxLinksPerSide, Math.max(3, Math.round(total / linkLength)))
			const solvedLinkLength = total / linkCount
			const lengthScale = solvedLinkLength / linkLength
			const phase = getTrackPhase(side, total)

			for (let i = 0; i < linkCount && instanceIndex < maxInstanceCount; i++) {
				const distance = modDistance(i * solvedLinkLength + phase, total)
				const pathPoint = pointAtDistance(path, lengths, distance)
				const previousPoint = pointAtDistance(path, lengths, modDistance(distance - solvedLinkLength * 0.5, total))
				const nextPoint = pointAtDistance(path, lengths, modDistance(distance + solvedLinkLength * 0.5, total))
				tempPosition.set(sideX, pathPoint.y, pathPoint.z)
				tempDirection.set(0, nextPoint.y - previousPoint.y, nextPoint.z - previousPoint.z)
				if (tempDirection.lengthSq() < 0.000001) {
					tempDirection.copy(FORWARD_VECTOR)
				} else {
					tempDirection.normalize()
				}
				tempQuaternion.setFromUnitVectors(FORWARD_VECTOR, tempDirection)
				tempScale.set(1, 1, lengthScale)
				tempMatrix.compose(tempPosition, tempQuaternion, tempScale)
				mesh.setMatrixAt(instanceIndex, tempMatrix)
				instanceIndex++
			}
		}

		mesh.count = instanceIndex
		mesh.instanceMatrix.needsUpdate = true
	})

	return <instancedMesh ref={meshRef} name='TrackLinks' args={[geometry, material, maxInstanceCount]} count={0} castShadow receiveShadow frustumCulled={false} />
})

export default TrackLinks
