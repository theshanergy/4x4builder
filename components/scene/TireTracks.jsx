import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, Quaternion, Matrix4, PlaneGeometry, CanvasTexture, MeshBasicMaterial, DoubleSide, Sphere } from 'three'

const MAX_TRACK_SEGMENTS = 1500
const SEGMENT_LENGTH = 0.3 // Length of each track segment
const MIN_SPAWN_DISTANCE = 0.15 // Minimum distance before spawning new segment
const MAX_SPAWN_DISTANCE = 2.0 // Maximum distance - if exceeded, reset tracking (prevents long jumps)
const TRACK_FADE_TIME = 30 // Seconds before tracks start fading
const TRACK_FADE_DURATION = 15 // Seconds to fully fade out
const MAX_TRACK_DISTANCE = 80 // Maximum distance from vehicle before tracks are removed

// Generate a procedural tire track texture using canvas
const createTrackTexture = () => {
	const canvas = document.createElement('canvas')
	canvas.width = 64
	canvas.height = 128
	const ctx = canvas.getContext('2d')

	// Transparent background
	ctx.clearRect(0, 0, canvas.width, canvas.height)

	// Tread block layout
	const edgeMargin = 10
	const gap = 6
	const cols = 2
	const availableWidth = canvas.width - edgeMargin * 2 - gap
	const blockWidth = availableWidth / cols
	const blockHeight = 10
	const startX = edgeMargin

	// Draw tread indentations - just the edges/shadows to look like pressed-in shapes
	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < cols; col++) {
			const x = startX + col * (blockWidth + gap)
			const y = row * (blockHeight + gap) + 8

			// Slightly randomize block dimensions for natural look
			const randW = blockWidth + (Math.random() - 0.5) * 3
			const randH = blockHeight + (Math.random() - 0.5) * 2

			// Calculate fade factor based on distance from edges
			const centerX = canvas.width / 2
			const distFromCenter = Math.abs(x + randW / 2 - centerX) / (canvas.width / 2)
			const edgeFade = 1 - Math.pow(distFromCenter, 0.5) * 0.6

			// Draw shadow edge (bottom and right) - darker, like depth
			ctx.strokeStyle = `rgba(60, 50, 35, ${0.5 * edgeFade})`
			ctx.lineWidth = 2.5
			ctx.lineCap = 'round'
			ctx.lineJoin = 'round'
			ctx.beginPath()
			ctx.moveTo(x + randW, y + 2)
			ctx.lineTo(x + randW, y + randH)
			ctx.lineTo(x + 2, y + randH)
			ctx.stroke()

			// Draw highlight edge (top and left) - lighter, like raised sand edge
			ctx.strokeStyle = `rgba(180, 165, 140, ${0.25 * edgeFade})`
			ctx.lineWidth = 2
			ctx.beginPath()
			ctx.moveTo(x, y + randH - 2)
			ctx.lineTo(x, y)
			ctx.lineTo(x + randW - 2, y)
			ctx.stroke()

			// Very subtle interior shadow to suggest depth
			ctx.fillStyle = `rgba(70, 58, 40, ${0.1 * edgeFade})`
			ctx.beginPath()
			ctx.roundRect(x + 1, y + 1, randW - 2, randH - 2, 1)
			ctx.fill()
		}
	}

	// Apply horizontal edge fade by drawing transparent gradients over the edges
	const edgeFadeWidth = 12

	// Left fade
	const leftGrad = ctx.createLinearGradient(0, 0, edgeFadeWidth, 0)
	leftGrad.addColorStop(0, 'rgba(0, 0, 0, 1)')
	leftGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
	ctx.globalCompositeOperation = 'destination-out'
	ctx.fillStyle = leftGrad
	ctx.fillRect(0, 0, edgeFadeWidth, canvas.height)

	// Right fade
	const rightGrad = ctx.createLinearGradient(canvas.width - edgeFadeWidth, 0, canvas.width, 0)
	rightGrad.addColorStop(0, 'rgba(0, 0, 0, 0)')
	rightGrad.addColorStop(1, 'rgba(0, 0, 0, 1)')
	ctx.fillStyle = rightGrad
	ctx.fillRect(canvas.width - edgeFadeWidth, 0, edgeFadeWidth, canvas.height)

	// Top fade
	const topGrad = ctx.createLinearGradient(0, 0, 0, 10)
	topGrad.addColorStop(0, 'rgba(0, 0, 0, 1)')
	topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
	ctx.fillStyle = topGrad
	ctx.fillRect(0, 0, canvas.width, 10)

	// Bottom fade
	const bottomGrad = ctx.createLinearGradient(0, canvas.height - 10, 0, canvas.height)
	bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)')
	bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 1)')
	ctx.fillStyle = bottomGrad
	ctx.fillRect(0, canvas.height - 10, canvas.width, 10)

	ctx.globalCompositeOperation = 'source-over'

	const texture = new CanvasTexture(canvas)
	texture.needsUpdate = true
	return texture
}

const SLIP_THRESHOLD = 2.0 // Minimum lateral velocity (m/s) to consider wheel slipping

const TireTracks = ({ vehicleController, wheelRefs, tireWidth = 0.28, tireRadius = 0.4 }) => {
	const meshRef = useRef()

	// Calculate track width from tire width (in meters)
	const trackWidth = tireWidth

	// Create texture once
	const trackTexture = useMemo(() => createTrackTexture(), [])

	// Create geometry - a simple plane for each track segment
	// We'll scale width per-instance, so use unit width here
	const geometry = useMemo(() => {
		const geo = new PlaneGeometry(1, SEGMENT_LENGTH)
		geo.rotateX(-Math.PI / 2) // Lay flat on ground
		return geo
	}, [])

	// Create material - we'll control opacity via instance color alpha simulation
	const material = useMemo(() => {
		return new MeshBasicMaterial({
			map: trackTexture,
			transparent: true,
			depthWrite: false,
			side: DoubleSide,
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -1,
		})
	}, [trackTexture])

	// Track segment data pool
	const segments = useMemo(() => {
		const data = []
		for (let i = 0; i < MAX_TRACK_SEGMENTS; i++) {
			data.push({
				active: false,
				position: new Vector3(),
				rotation: 0, // Y rotation
				spawnTime: 0,
				wheelIndex: 0,
				spawnOrder: 0, // Track spawn order for distance-based fading
			})
		}
		return data
	}, [])

	// Track last spawn position per wheel and whether we're actively tracking
	const lastSpawnPos = useRef(wheelRefs.map(() => new Vector3()))
	const isTracking = useRef(wheelRefs.map(() => false))

	// Round-robin index for segment allocation
	const nextSegmentIndex = useRef(0)
	// Global spawn counter for distance-based fading
	const spawnCounter = useRef(0)
	// Track active segment indices for efficient iteration
	const activeSegments = useRef(new Set())

	// Temp objects for calculations
	const tempVec = useMemo(() => new Vector3(), [])
	const tempMatrix = useMemo(() => new Matrix4(), [])
	const tempQuat = useMemo(() => new Quaternion(), [])
	const tempScale = useMemo(() => new Vector3(1, 1, 1), [])
	const upAxis = useMemo(() => new Vector3(0, 1, 0), [])
	const tempRight = useMemo(() => new Vector3(), [])
	const tempVelocity = useMemo(() => new Vector3(), [])

	// Temp vector for vehicle position
	const vehiclePos = useMemo(() => new Vector3(), [])

	// Initialize instanced mesh
	useEffect(() => {
		if (meshRef.current) {
			// Initialize all instances to be invisible/off-screen
			const hideMatrix = new Matrix4().makeTranslation(0, -1000, 0)
			for (let i = 0; i < MAX_TRACK_SEGMENTS; i++) {
				meshRef.current.setMatrixAt(i, hideMatrix)
			}
			meshRef.current.instanceMatrix.needsUpdate = true

			// Set a very large bounding sphere so tracks are never culled
			// regardless of where the vehicle travels
			meshRef.current.geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), Infinity)
		}
	}, [])

	useFrame((state) => {
		if (!vehicleController.current || !meshRef.current) return

		const controller = vehicleController.current
		const currentTime = state.clock.elapsedTime

		// Get vehicle speed and velocity
		let speed = 0
		let chassisVel = null
		try {
			chassisVel = controller.chassis().linvel()
			speed = Math.sqrt(chassisVel.x * chassisVel.x + chassisVel.z * chassisVel.z)
		} catch (e) {
			return
		}

		// Get chassis rotation for calculating vehicle direction
		const chassisRotation = controller.chassis().rotation()
		const chassisQuat = tempQuat.set(chassisRotation.x, chassisRotation.y, chassisRotation.z, chassisRotation.w)

		// Calculate lateral slip for the vehicle
		// Compare vehicle's velocity direction to its facing direction
		tempRight.set(1, 0, 0).applyQuaternion(chassisQuat)
		// Calculate lateral velocity component (how much the vehicle is sliding sideways)
		tempVelocity.set(chassisVel.x, 0, chassisVel.z)
		const lateralSpeed = Math.abs(tempVelocity.dot(tempRight))
		const isSlipping = lateralSpeed > SLIP_THRESHOLD

		// Process each wheel
		for (let wi = 0; wi < wheelRefs.length; wi++) {
			const wheelRef = wheelRefs[wi]

			// Check if wheel is touching ground
			const inContact = controller.wheelIsInContact(wi)

			if (!inContact || !wheelRef.current) {
				// Wheel left ground, stop tracking this wheel
				isTracking.current[wi] = false
				continue
			}

			// Get current wheel position and calculate ground contact point
			wheelRef.current.getWorldPosition(tempVec)
			// Ground is at wheel center Y minus tire radius, plus small offset to prevent z-fighting
			tempVec.y = tempVec.y - tireRadius + 0.01

			// If not tracking, start fresh
			if (!isTracking.current[wi]) {
				lastSpawnPos.current[wi].copy(tempVec)
				isTracking.current[wi] = true
				continue
			}

			// Check distance from last spawn
			const dist = tempVec.distanceTo(lastSpawnPos.current[wi])

			// If distance is too large, reset (teleport or physics glitch)
			if (dist > MAX_SPAWN_DISTANCE) {
				lastSpawnPos.current[wi].copy(tempVec)
				continue
			}

			// Only spawn tracks if wheel is slipping, moving enough, and above minimum distance
			if (isSlipping && speed > 0.5 && dist >= MIN_SPAWN_DISTANCE) {
				// Calculate direction of travel
				const dirX = tempVec.x - lastSpawnPos.current[wi].x
				const dirZ = tempVec.z - lastSpawnPos.current[wi].z
				const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ)

				if (dirLen > 0.001) {
					const rotation = Math.atan2(dirX / dirLen, dirZ / dirLen)

					// Spawn segments along the path to fill gaps
					const numSegments = Math.ceil(dist / MIN_SPAWN_DISTANCE)
					for (let s = 0; s < numSegments; s++) {
						const t = (s + 1) / numSegments

						// Get next segment slot
						const segIndex = nextSegmentIndex.current
						const seg = segments[segIndex]
						nextSegmentIndex.current = (nextSegmentIndex.current + 1) % MAX_TRACK_SEGMENTS

						// If reusing an active segment, it will be replaced
						// (no need to delete from Set, we're overwriting)

						// Interpolate position
						seg.position.lerpVectors(lastSpawnPos.current[wi], tempVec, t)
						seg.active = true
						seg.rotation = rotation
						seg.spawnTime = currentTime
						seg.wheelIndex = wi
						seg.spawnOrder = spawnCounter.current++

						// Update instance matrix with scale for track width
						tempQuat.setFromAxisAngle(upAxis, rotation)
						tempScale.set(trackWidth, 1, 1)
						tempMatrix.compose(seg.position, tempQuat, tempScale)
						meshRef.current.setMatrixAt(segIndex, tempMatrix)

						// Add to active set
						activeSegments.current.add(segIndex)
					}
				}

				// Update last spawn position
				lastSpawnPos.current[wi].copy(tempVec)
			}
		}

		// Update segment visibility based on age, distance from vehicle, and spawn order
		// Only iterate active segments for performance
		const currentSpawnOrder = spawnCounter.current
		const chassisPos = controller.chassis().translation()
		vehiclePos.set(chassisPos.x, chassisPos.y, chassisPos.z)

		let hasChanges = false
		const toRemove = []

		for (const i of activeSegments.current) {
			const seg = segments[i]
			const age = currentTime - seg.spawnTime

			// Check distance from vehicle - remove if too far
			const distToVehicle = seg.position.distanceTo(vehiclePos)
			if (distToVehicle > MAX_TRACK_DISTANCE) {
				seg.active = false
				tempMatrix.makeTranslation(0, -1000, 0)
				meshRef.current.setMatrixAt(i, tempMatrix)
				toRemove.push(i)
				hasChanges = true
				continue
			}

			// Calculate time-based fade (0 = full opacity, 1 = invisible)
			let timeFade = 0
			if (age > TRACK_FADE_TIME) {
				timeFade = Math.min(1, (age - TRACK_FADE_TIME) / TRACK_FADE_DURATION)
			}

			// Calculate distance-based fade over the ENTIRE track length
			// Newest segments = full opacity, oldest = nearly invisible
			const segmentAge = currentSpawnOrder - seg.spawnOrder
			// Use a curve so fade is more gradual at the start and steeper at the end
			const normalizedAge = Math.min(1, segmentAge / MAX_TRACK_SEGMENTS)
			// Use quadratic easing for smoother fade - most of track visible, fades near end
			const distanceFade = normalizedAge * normalizedAge

			// Use the stronger of the two fade values
			const fade = Math.max(timeFade, distanceFade)
			const opacity = 1 - fade

			if (fade >= 0.99) {
				// Fully faded, deactivate and hide
				seg.active = false
				tempMatrix.makeTranslation(0, -1000, 0)
				meshRef.current.setMatrixAt(i, tempMatrix)
				toRemove.push(i)
				hasChanges = true
			} else {
				// Apply fade by scaling down the segment (smaller = more transparent appearance)
				// Combined with updating the Y position to sink slightly
				const scale = 0.3 + opacity * 0.7 // Scale from 0.3 to 1.0
				tempQuat.setFromAxisAngle(upAxis, seg.rotation)
				tempScale.set(trackWidth * scale, 1, scale)
				// Sink the track slightly as it fades
				tempVec.copy(seg.position)
				tempVec.y -= (1 - opacity) * 0.02
				tempMatrix.compose(tempVec, tempQuat, tempScale)
				meshRef.current.setMatrixAt(i, tempMatrix)
				hasChanges = true
			}
		}

		// Remove deactivated segments from the Set
		for (const i of toRemove) {
			activeSegments.current.delete(i)
		}

		if (hasChanges) {
			meshRef.current.instanceMatrix.needsUpdate = true
		}
	})

	return <instancedMesh ref={meshRef} args={[geometry, material, MAX_TRACK_SEGMENTS]} frustumCulled={false} />
}

export default TireTracks
