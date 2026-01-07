import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, PlaneGeometry, ShaderMaterial, DoubleSide, Vector3, Matrix4, Quaternion, InstancedBufferAttribute } from 'three'

const MAX_TRACK_SEGMENTS = 1500
const SEGMENT_LENGTH = 0.3
const MIN_SPAWN_DISTANCE = 0.15
const MAX_SPAWN_DISTANCE = 2.0
const TRACK_FADE_TIME = 30
const TRACK_FADE_DURATION = 15
const MAX_TRACK_DISTANCE = 80

const SLIP_THRESHOLD = 2.0

// Vertex shader - passes instance data to fragment shader
const vertexShader = `
  attribute float aSpawnTime;
  attribute float aSpawnOrder;
  
  varying float vSpawnTime;
  varying float vSpawnOrder;
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    vSpawnTime = aSpawnTime;
    vSpawnOrder = aSpawnOrder;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`

// Fragment shader - handles GPU-based fading
const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uSpawnCounter;
  uniform float uMaxSegments;
  uniform float uTrackFadeTime;
  uniform float uTrackFadeDuration;
  
  varying float vSpawnTime;
  varying float vSpawnOrder;
  varying vec2 vUv;
  
  void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    
    // Time-based fade
    float age = uTime - vSpawnTime;
    float timeFade = 0.0;
    if (age > uTrackFadeTime) {
      timeFade = min(1.0, (age - uTrackFadeTime) / uTrackFadeDuration);
    }
    
    // Distance-based fade (order-based)
    float orderAge = uSpawnCounter - vSpawnOrder;
    float normalizedAge = min(1.0, orderAge / uMaxSegments);
    float orderFade = normalizedAge * normalizedAge;
    
    // Use stronger of the two fades
    float fade = max(timeFade, orderFade);
    
    // Apply fade to alpha
    float alpha = (1.0 - fade) * texColor.a;
    
    // Discard fully faded fragments
    if (alpha < 0.01) discard;
    
    gl_FragColor = vec4(texColor.rgb, alpha);
  }
`

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

			// Add slight random variation to tread block sizes
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

const TireTracks = ({ vehicleController, wheelRefs, tireWidth = 0.28, tireRadius = 0.4 }) => {
	const meshRef = useRef()

	// Create texture once
	const trackTexture = useMemo(() => createTrackTexture(), [])

	// Create geometry - a simple plane for each track segment
	// We'll scale width per-instance, so use unit width here
	const geometry = useMemo(() => {
		const geo = new PlaneGeometry(1, SEGMENT_LENGTH)
		geo.rotateX(-Math.PI / 2) // Lay flat on ground
		return geo
	}, [])

	// Create shader material with GPU-based fading
	const material = useMemo(() => {
		return new ShaderMaterial({
			uniforms: {
				uTexture: { value: trackTexture },
				uTime: { value: 0 },
				uSpawnCounter: { value: 0 },
				uMaxSegments: { value: MAX_TRACK_SEGMENTS },
				uTrackFadeTime: { value: TRACK_FADE_TIME },
				uTrackFadeDuration: { value: TRACK_FADE_DURATION },
			},
			vertexShader,
			fragmentShader,
			transparent: true,
			depthWrite: false,
			side: DoubleSide,
		})
	}, [trackTexture])

	// Track segment data pool
	const segments = useMemo(() => {
		const data = []
		for (let i = 0; i < MAX_TRACK_SEGMENTS; i++) {
			data.push({
				active: false,
				position: new Vector3(),
				rotation: 0,
				spawnTime: 0,
				wheelIndex: 0,
				spawnOrder: 0,
			})
		}
		return data
	}, [])

	// Track last spawn position per wheel and whether we're actively tracking
	const lastSpawnPos = useRef([])
	const isTracking = useRef([])

	// Ensure tracking arrays match wheelRefs length
	if (lastSpawnPos.current.length !== wheelRefs.length) {
		lastSpawnPos.current = wheelRefs.map(() => new Vector3())
		isTracking.current = wheelRefs.map(() => false)
	}

	// Round-robin index for segment allocation
	const nextSegmentIndex = useRef(0)
	// Global spawn counter for distance-based fading
	const spawnCounter = useRef(0)
	// Track active segment indices for distance culling
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

			// Initialize instance attributes for GPU fading
			const spawnTimeAttr = new Float32Array(MAX_TRACK_SEGMENTS).fill(-1000) // Start with old time so they're fully faded
			const spawnOrderAttr = new Float32Array(MAX_TRACK_SEGMENTS).fill(0)

			meshRef.current.geometry.setAttribute('aSpawnTime', new InstancedBufferAttribute(spawnTimeAttr, 1))
			meshRef.current.geometry.setAttribute('aSpawnOrder', new InstancedBufferAttribute(spawnOrderAttr, 1))

			meshRef.current.instanceMatrix.needsUpdate = true
		}
	}, [])

	// Cleanup Three.js resources on unmount
	useEffect(() => {
		return () => {
			geometry.dispose()
			material.dispose()
			trackTexture.dispose()
		}
	}, [geometry, material, trackTexture])

	useFrame((state) => {
		if (!vehicleController.current || !meshRef.current) return

		const controller = vehicleController.current
		const currentTime = state.clock.elapsedTime

		// Update shader uniforms for GPU-based fading
		material.uniforms.uTime.value = currentTime
		material.uniforms.uSpawnCounter.value = spawnCounter.current

		// Get vehicle speed and velocity
		let speed = 0
		let chassisVel = null
		let chassisRotation = null
		try {
			chassisVel = controller.chassis().linvel()
			speed = Math.sqrt(chassisVel.x * chassisVel.x + chassisVel.z * chassisVel.z)
			chassisRotation = controller.chassis().rotation()
		} catch (e) {
			return
		}

		// Get chassis rotation for calculating vehicle direction
		const chassisQuat = tempQuat.set(chassisRotation.x, chassisRotation.y, chassisRotation.z, chassisRotation.w)

		// Calculate lateral slip for the vehicle
		tempRight.set(1, 0, 0).applyQuaternion(chassisQuat)
		tempVelocity.set(chassisVel.x, 0, chassisVel.z)
		const lateralSpeed = Math.abs(tempVelocity.dot(tempRight))
		const isSlipping = lateralSpeed > SLIP_THRESHOLD

		// Get attribute references for updating
		const aSpawnTime = meshRef.current.geometry.attributes.aSpawnTime
		const aSpawnOrder = meshRef.current.geometry.attributes.aSpawnOrder

		// Skip if attributes haven't been initialized yet
		if (!aSpawnTime || !aSpawnOrder) return

		let attributesNeedUpdate = false

		// Process each wheel
		for (let wi = 0; wi < wheelRefs.length; wi++) {
			const wheelRef = wheelRefs[wi]

			// Skip if tracking arrays are out of sync
			if (wi >= lastSpawnPos.current.length) continue

			// Check if wheel is touching ground
			let inContact = false
			try {
				inContact = controller.wheelIsInContact(wi)
			} catch (e) {
				continue
			}

			if (!inContact || !wheelRef.current) {
				isTracking.current[wi] = false
				continue
			}

			// Get current wheel position and calculate ground contact point
			wheelRef.current.getWorldPosition(tempVec)
			tempVec.y = tempVec.y - tireRadius + 0.01

			if (!isTracking.current[wi]) {
				lastSpawnPos.current[wi].copy(tempVec)
				isTracking.current[wi] = true
				continue
			}

			// Check distance from last spawn
			const dist = tempVec.distanceTo(lastSpawnPos.current[wi])

			if (dist > MAX_SPAWN_DISTANCE) {
				lastSpawnPos.current[wi].copy(tempVec)
				continue
			}

			// Only spawn tracks if wheel is slipping, moving enough, and above minimum distance
			if (isSlipping && speed > 0.5 && dist >= MIN_SPAWN_DISTANCE) {
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

						// Interpolate position
						seg.position.lerpVectors(lastSpawnPos.current[wi], tempVec, t)
						seg.active = true
						seg.rotation = rotation
						seg.spawnTime = currentTime
						seg.wheelIndex = wi
						seg.spawnOrder = spawnCounter.current++

						// Update instance matrix
						tempQuat.setFromAxisAngle(upAxis, rotation)
						tempScale.set(tireWidth, 1, 1)
						tempMatrix.compose(seg.position, tempQuat, tempScale)
						meshRef.current.setMatrixAt(segIndex, tempMatrix)

						// Update GPU attributes
						aSpawnTime.setX(segIndex, currentTime)
						aSpawnOrder.setX(segIndex, seg.spawnOrder)
						attributesNeedUpdate = true

						activeSegments.current.add(segIndex)
					}
				}

				lastSpawnPos.current[wi].copy(tempVec)
			}
		}

		// Only handle distance culling on CPU - GPU handles fading
		if (activeSegments.current.size > 0) {
			let chassisPos
			try {
				chassisPos = controller.chassis().translation()
			} catch (e) {
				return
			}
			vehiclePos.set(chassisPos.x, chassisPos.y, chassisPos.z)

			let hasChanges = false
			const toRemove = []

			for (const i of activeSegments.current) {
				const seg = segments[i]
				if (seg.position.distanceTo(vehiclePos) > MAX_TRACK_DISTANCE) {
					seg.active = false
					tempMatrix.makeTranslation(0, -1000, 0)
					meshRef.current.setMatrixAt(i, tempMatrix)
					toRemove.push(i)
					hasChanges = true
				}
			}

			// Remove after iteration to avoid modifying Set while iterating
			for (const i of toRemove) {
				activeSegments.current.delete(i)
			}

			// Update GPU when needed
			if (hasChanges || attributesNeedUpdate) {
				meshRef.current.instanceMatrix.needsUpdate = true
			}
			if (attributesNeedUpdate) {
				aSpawnTime.needsUpdate = true
				aSpawnOrder.needsUpdate = true
			}
		} else if (attributesNeedUpdate) {
			meshRef.current.instanceMatrix.needsUpdate = true
			aSpawnTime.needsUpdate = true
			aSpawnOrder.needsUpdate = true
		}
	})

	return <instancedMesh ref={meshRef} args={[geometry, material, MAX_TRACK_SEGMENTS]} frustumCulled={false} renderOrder={-1} />
}

export default TireTracks
