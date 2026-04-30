import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three'

const SIDES = ['L', 'R']
const DEFAULT_LINK_WIDTH = 0.45
const DEFAULT_LINK_LENGTH = 0.18
const DEFAULT_LINK_HEIGHT = 0.08
const DEFAULT_TRACK_DEPTH = 0.08
const DEFAULT_MAX_LINKS_PER_SIDE = 96
const DEFAULT_SAMPLES_PER_WHEEL = 64
const PHASE_EPSILON = 0.001
const WHEEL_POSITION_EPSILON = 0.0005
const FORWARD_VECTOR = new Vector3(0, 0, 1)
const WHEEL_AXLE_VECTOR = new Vector3(1, 0, 0)
const INCHES_TO_METERS = 0.0254

const cross = (origin, a, b) => (a.z - origin.z) * (b.y - origin.y) - (a.y - origin.y) * (b.z - origin.z)

const createPathCache = () => ({
	samples: [],
	sorted: [],
	lower: [],
	upper: [],
	path: [],
	lengths: [],
})

const convexHull = (points, cache) => {
	if (points.length <= 3) return points

	const sorted = cache.sorted
	sorted.length = points.length
	for (let i = 0; i < points.length; i++) {
		sorted[i] = points[i]
	}
	sorted.sort((a, b) => a.z - b.z || a.y - b.y)

	const lower = cache.lower
	lower.length = 0
	for (const point of sorted) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
			lower.pop()
		}
		lower.push(point)
	}

	const upper = cache.upper
	upper.length = 0
	for (let i = sorted.length - 1; i >= 0; i--) {
		const point = sorted[i]
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
			upper.pop()
		}
		upper.push(point)
	}

	lower.pop()
	upper.pop()

	const path = cache.path
	path.length = 0
	for (const point of lower) path.push(point)
	for (const point of upper) path.push(point)
	return path
}

const getPathMetrics = (path, lengths) => {
	lengths.length = 0
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

const pointAtDistance = (path, lengths, distance, target) => {
	let remaining = distance

	for (let i = 0; i < path.length; i++) {
		const length = lengths[i]
		if (length <= 0) continue

		if (remaining <= length) {
			const start = path[i]
			const end = path[(i + 1) % path.length]
			const t = remaining / length
			target.y = start.y + (end.y - start.y) * t
			target.z = start.z + (end.z - start.z) * t
			return target
		}

		remaining -= length
	}

	target.y = path[0].y
	target.z = path[0].z
	return target
}

const modDistance = (distance, total) => {
	if (total <= 0) return 0
	return ((distance % total) + total) % total
}

const wheelPositionsChanged = (side, sideWheels, wheelRefs, lastWheelPositions, currentWheelPositions) => {
	const previousPositions = lastWheelPositions[side]
	const expectedLength = sideWheels.length * 3
	let positions = currentWheelPositions[side]
	if (!positions || positions.length !== expectedLength) {
		positions = new Array(expectedLength)
		currentWheelPositions[side] = positions
	}

	for (let wheelIndex = 0; wheelIndex < sideWheels.length; wheelIndex++) {
		const wheel = sideWheels[wheelIndex]
		const refPosition = wheelRefs?.[wheel.visualIndex]?.current?.position
		const offset = wheelIndex * 3
		positions[offset] = refPosition?.x ?? wheel.position[0]
		positions[offset + 1] = refPosition?.y ?? wheel.position[1]
		positions[offset + 2] = refPosition?.z ?? wheel.position[2]
	}

	let changed = !previousPositions || previousPositions.length !== expectedLength
	if (!changed) {
		for (let i = 0; i < expectedLength; i++) {
			if (Math.abs(previousPositions[i] - positions[i]) > WHEEL_POSITION_EPSILON) {
				changed = true
				break
			}
		}
	}

	if (changed) {
		let committedPositions = previousPositions
		if (!committedPositions || committedPositions.length !== expectedLength) {
			committedPositions = new Array(expectedLength)
			lastWheelPositions[side] = committedPositions
		}
		for (let i = 0; i < expectedLength; i++) {
			committedPositions[i] = positions[i]
		}
	}

	return changed
}

const buildTrackPath = (sideWheels, wheelRefs, samplesPerWheel, trackDepth, linkLength, maxLinksPerSide, cache) => {
	if (!sideWheels || sideWheels.length < 2) return null

	const sampleCount = Math.max(8, samplesPerWheel)
	const samples = cache.samples
	const totalSamples = sideWheels.length * sampleCount
	samples.length = totalSamples
	let sideX = 0
	let sampleIndex = 0

	for (const wheel of sideWheels) {
		const refPosition = wheelRefs?.[wheel.visualIndex]?.current?.position
		const x = refPosition?.x ?? wheel.position[0]
		const y = refPosition?.y ?? wheel.position[1]
		const z = refPosition?.z ?? wheel.position[2]
		const radius = (wheel.radius || 0.35) + trackDepth * 0.5
		sideX += x

		for (let sample = 0; sample < sampleCount; sample++) {
			const angle = (sample / sampleCount) * Math.PI * 2
			const point = samples[sampleIndex] || { y: 0, z: 0 }
			point.y = y + Math.sin(angle) * radius
			point.z = z + Math.cos(angle) * radius
			samples[sampleIndex] = point
			sampleIndex++
		}
	}

	const path = convexHull(samples, cache)
	if (path.length < 3) return null

	const { lengths, total } = getPathMetrics(path, cache.lengths)
	if (total <= 0) return null

	const linkCount = Math.min(maxLinksPerSide, Math.max(3, Math.round(total / linkLength)))
	const solvedLinkLength = total / linkCount

	return {
		path,
		lengths,
		total,
		linkCount,
		solvedLinkLength,
		lengthScale: solvedLinkLength / linkLength,
		sideX: sideX / sideWheels.length,
	}
}

const TrackLinks = memo(({ trackConfig, wheelPositions, wheelRefs, physicsWheelPositions, vehicleController, wheelRotationsRef }) => {
	const meshRef = useRef()
	const lastPhasesRef = useRef({ L: null, R: null })
	const lastWheelPositionsRef = useRef({ L: null, R: null })
	const currentWheelPositionsRef = useRef({ L: null, R: null })
	const trackMotionsRef = useRef({ L: { phase: 0, travelDistance: 0 }, R: { phase: 0, travelDistance: 0 } })
	const trackPathCachesRef = useRef({ L: createPathCache(), R: createPathCache() })
	const trackPathsRef = useRef({ L: null, R: null })
	const boundsComputedRef = useRef(false)

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

	const nonPhysicsTrackWheelsBySide = useMemo(() => {
		const groups = { L: [], R: [] }
		for (const wheel of wheelPositions) {
			if (!wheel.isTrackWheel || wheel.physics) continue
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
	const tempWheelQuaternion = useMemo(() => new Quaternion(), [])
	const tempPathPoint = useMemo(() => ({ y: 0, z: 0 }), [])
	const tempPreviousPoint = useMemo(() => ({ y: 0, z: 0 }), [])
	const tempNextPoint = useMemo(() => ({ y: 0, z: 0 }), [])

	useEffect(() => {
		lastPhasesRef.current = { L: null, R: null }
		lastWheelPositionsRef.current = { L: null, R: null }
		currentWheelPositionsRef.current = { L: null, R: null }
		trackMotionsRef.current = { L: { phase: 0, travelDistance: 0 }, R: { phase: 0, travelDistance: 0 } }
		trackPathsRef.current = { L: null, R: null }
		boundsComputedRef.current = false
	}, [trackWheelsBySide, samplesPerWheel, trackDepth, linkLength, maxLinksPerSide])

	const getTrackMotion = (side, perimeter, target) => {
		const controller = vehicleController?.current
		target.phase = 0
		target.travelDistance = 0
		if (perimeter <= 0) return target

		const wheels = physicsWheelsBySide[side]
		let distance = 0
		let count = 0

		for (const wheel of wheels) {
			let wheelRotation = 0
			if (controller) {
				try {
					wheelRotation = controller.wheelRotation(wheel.physicsIndex) || 0
				} catch {
					return target
				}
			} else if (wheelRotationsRef?.current) {
				wheelRotation = wheelRotationsRef.current[wheel.physicsIndex] || 0
			}
			distance += wheelRotation * (wheel.physicsRadius || wheel.radius || 0.35)
			count++
		}

		if (count > 0) {
			target.travelDistance = distance / count
			target.phase = modDistance(-target.travelDistance, perimeter)
		}

		return target
	}

	const spinNonPhysicsTrackWheels = (side, travelDistance) => {
		const wheels = nonPhysicsTrackWheelsBySide[side]
		for (const wheel of wheels) {
			const wheelRef = wheelRefs?.[wheel.visualIndex]?.current
			if (!wheelRef) continue

			const radius = wheel.radius || 0.35
			tempWheelQuaternion.setFromAxisAngle(WHEEL_AXLE_VECTOR, radius > 0 ? travelDistance / radius : 0)
			wheelRef.quaternion.copy(tempWheelQuaternion)
		}
	}

	useFrame(() => {
		const mesh = meshRef.current
		if (!mesh) return

		const phases = { L: 0, R: 0 }
		let shouldUpdate = false

		for (const side of SIDES) {
			const sideWheels = trackWheelsBySide[side]
			if (!sideWheels || sideWheels.length < 2) continue

			const pathChanged = wheelPositionsChanged(side, sideWheels, wheelRefs, lastWheelPositionsRef.current, currentWheelPositionsRef.current)
			if (pathChanged || !trackPathsRef.current[side]) {
				trackPathsRef.current[side] = buildTrackPath(
					sideWheels,
					wheelRefs,
					samplesPerWheel,
					trackDepth,
					linkLength,
					maxLinksPerSide,
					trackPathCachesRef.current[side]
				)
				boundsComputedRef.current = false
				shouldUpdate = true
			}

			const trackPath = trackPathsRef.current[side]
			if (!trackPath) continue

			const motion = getTrackMotion(side, trackPath.total, trackMotionsRef.current[side])
			phases[side] = motion.phase

			const previousPhase = lastPhasesRef.current[side]
			if (previousPhase === null || Math.abs(motion.phase - previousPhase) > PHASE_EPSILON) {
				shouldUpdate = true
			}
		}

		if (!shouldUpdate) return

		let instanceIndex = 0

		for (const side of SIDES) {
			const trackPath = trackPathsRef.current[side]
			if (!trackPath) continue

			const { path, lengths, total, linkCount, solvedLinkLength, lengthScale, sideX } = trackPath
			const phase = phases[side]
			spinNonPhysicsTrackWheels(side, trackMotionsRef.current[side].travelDistance)

			for (let i = 0; i < linkCount && instanceIndex < maxInstanceCount; i++) {
				const distance = modDistance(i * solvedLinkLength + phase, total)
				pointAtDistance(path, lengths, distance, tempPathPoint)
				pointAtDistance(path, lengths, modDistance(distance - solvedLinkLength * 0.5, total), tempPreviousPoint)
				pointAtDistance(path, lengths, modDistance(distance + solvedLinkLength * 0.5, total), tempNextPoint)
				tempPosition.set(sideX, tempPathPoint.y, tempPathPoint.z)
				tempDirection.set(0, tempNextPoint.y - tempPreviousPoint.y, tempNextPoint.z - tempPreviousPoint.z)
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
		lastPhasesRef.current = phases

		if (!boundsComputedRef.current) {
			mesh.computeBoundingSphere()
			mesh.computeBoundingBox()
			boundsComputedRef.current = true
		}
	})

	return <instancedMesh ref={meshRef} name='TrackLinks' args={[geometry, material, maxInstanceCount]} count={0} castShadow receiveShadow />
})

export default TrackLinks
