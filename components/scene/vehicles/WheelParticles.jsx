import { useRef, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Vector3, NormalBlending, TextureLoader, Quaternion } from 'three'
import { WATER_LEVEL } from '../../../config/water'

// Configuration values only - no behavior
const WATER_CONFIG = {
	maxParticles: 1500,
	spawnMin: 1,
	spawnMax: 16,
	spawnMultiplier: 0.5,
	maxSpeed: 2.0,
	speedMultiplier: 0.15,
	upwardVariance: 1.5,
	randomness: 0.2,
	lifetimeMin: 0.4,
	lifetimeMax: 0.8,
	sizeMin: 0.05,
	sizeRange: 0.15,
}

const DUST_CONFIG = {
	maxParticles: 500,
	spawnMin: 1,
	spawnMax: 4,
	spawnMultiplier: 0.3,
	maxSpeed: 1.5,
	speedMultiplier: 0.08,
	upwardMultiplier: 0.4,
	upwardVariance: 0.5,
	randomness: 0.3,
	lifetimeMin: 1.5,
	lifetimeMax: 3.5,
	sizeMin: 1.5,
	sizeRange: 2.5,
}

// Shared vertex shader
const PARTICLE_VERTEX_SHADER = `
	attribute float size;
	attribute float opacity;
	varying float vOpacity;
	void main() {
		vOpacity = opacity;
		vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
		gl_PointSize = size * (450.0 / -mvPosition.z);
		gl_Position = projectionMatrix * mvPosition;
	}
`

const WATER_FRAGMENT_SHADER = `
	varying float vOpacity;
	void main() {
		vec2 uv = gl_PointCoord.xy - 0.5;
		float r2 = dot(uv, uv);
		if (r2 > 0.25) discard;
		float r = sqrt(r2);
		float alpha = 1.0 - smoothstep(0.3, 0.5, r);
		vec3 color = vec3(0.95, 0.97, 1.0);
		gl_FragColor = vec4(color, vOpacity * alpha * 0.4);
	}
`

const DUST_FRAGMENT_SHADER = `
	uniform sampler2D uTexture;
	varying float vOpacity;
	void main() {
		vec2 uv = gl_PointCoord.xy - 0.5;
		float r2 = dot(uv, uv);
		if (r2 > 0.25) discard;
		vec3 texColor = texture2D(uTexture, vec2(0.5, 0.5)).rgb;
		float luminance = dot(texColor, vec3(0.299, 0.587, 0.114));
		vec3 finalColor = mix(texColor, vec3(luminance), 0.3);
		float alpha = exp(-r2 * 8.0) * 0.1;
		gl_FragColor = vec4(finalColor, vOpacity * alpha);
	}
`

// Create particle system with typed arrays
const createParticleSystem = (maxParticles) => ({
	nextIndex: 0,
	activeCount: 0,
	// Particle state
	active: new Uint8Array(maxParticles),
	life: new Float32Array(maxParticles),
	maxLife: new Float32Array(maxParticles),
	initialSize: new Float32Array(maxParticles),
	velocityX: new Float32Array(maxParticles),
	velocityY: new Float32Array(maxParticles),
	velocityZ: new Float32Array(maxParticles),
	// Geometry attributes (written directly to GPU)
	positions: new Float32Array(maxParticles * 3),
	sizes: new Float32Array(maxParticles),
	opacities: new Float32Array(maxParticles),
})

const WheelParticles = ({ vehicleController, wheelRefs, wheelRadius = 0.35, wheelWidth = 0.3 }) => {
	const sandTexture = useLoader(TextureLoader, '/assets/images/ground/sand.jpg')

	// Geometry refs
	const waterGeomRef = useRef()
	const dustGeomRef = useRef()

	// Particle systems
	const waterSystem = useRef(createParticleSystem(WATER_CONFIG.maxParticles))
	const dustSystem = useRef(createParticleSystem(DUST_CONFIG.maxParticles))

	// Track wheel state
	const prevWheelRotations = useRef(wheelRefs.map(() => 0))

	// Reusable vectors
	const tempVec = useMemo(() => new Vector3(), [])
	const tempQuat = useMemo(() => new Quaternion(), [])
	const forwardDir = useMemo(() => new Vector3(), [])
	const rightDir = useMemo(() => new Vector3(), [])

	// Spawn water particles at water surface intersection
	const spawnWaterParticles = (system, angularVel, wheelCenterY, spawnX, spawnZ) => {
		const cfg = WATER_CONFIG
		const spinRate = Math.abs(angularVel)
		const spinDir = angularVel >= 0 ? 1 : -1
		const count = Math.min(cfg.spawnMax, Math.max(cfg.spawnMin, (spinRate * cfg.spawnMultiplier) | 0))

		// Calculate tangent direction at water intersection
		const depthBelowCenter = wheelCenterY - WATER_LEVEL
		const horizontalOffset = Math.sqrt(Math.max(0, wheelRadius * wheelRadius - depthBelowCenter * depthBelowCenter))
		const tangentUp = horizontalOffset / wheelRadius
		const tangentForward = depthBelowCenter / wheelRadius

		for (let s = 0; s < count; s++) {
			const i = system.nextIndex
			system.nextIndex = (system.nextIndex + 1) % cfg.maxParticles

			if (!system.active[i]) system.activeCount++
			system.active[i] = 1
			system.life[i] = 0
			system.maxLife[i] = cfg.lifetimeMin + Math.random() * (cfg.lifetimeMax - cfg.lifetimeMin)

			// Position at water surface with lateral spread
			const lateralOffset = (Math.random() - 0.5) * wheelWidth
			const i3 = i * 3
			system.positions[i3] = spawnX + forwardDir.x * horizontalOffset * spinDir + rightDir.x * lateralOffset
			system.positions[i3 + 1] = WATER_LEVEL
			system.positions[i3 + 2] = spawnZ + forwardDir.z * horizontalOffset * spinDir + rightDir.z * lateralOffset

			// Velocity follows wheel tangent at intersection point
			const speed = Math.min(cfg.maxSpeed, spinRate * wheelRadius * cfg.speedMultiplier)
			system.velocityX[i] = forwardDir.x * spinDir * speed * tangentForward + (Math.random() - 0.5) * cfg.randomness
			system.velocityY[i] = speed * tangentUp + (Math.random() - 0.5) * cfg.upwardVariance
			system.velocityZ[i] = forwardDir.z * spinDir * speed * tangentForward + (Math.random() - 0.5) * cfg.randomness

			system.initialSize[i] = cfg.sizeMin + Math.random() * cfg.sizeRange
		}
	}

	// Spawn dust particles behind wheel
	const spawnDustParticles = (system, angularVel, spawnX, spawnY, spawnZ) => {
		const cfg = DUST_CONFIG
		const spinRate = Math.abs(angularVel)
		const spinDir = angularVel >= 0 ? 1 : -1
		const count = Math.min(cfg.spawnMax, Math.max(cfg.spawnMin, (spinRate * cfg.spawnMultiplier) | 0))

		for (let s = 0; s < count; s++) {
			const i = system.nextIndex
			system.nextIndex = (system.nextIndex + 1) % cfg.maxParticles

			if (!system.active[i]) system.activeCount++
			system.active[i] = 1
			system.life[i] = 0
			system.maxLife[i] = cfg.lifetimeMin + Math.random() * (cfg.lifetimeMax - cfg.lifetimeMin)

			// Position behind wheel with lateral spread
			const lateralOffset = (Math.random() - 0.5) * wheelWidth
			const i3 = i * 3
			system.positions[i3] = spawnX + rightDir.x * lateralOffset
			system.positions[i3 + 1] = spawnY
			system.positions[i3 + 2] = spawnZ + rightDir.z * lateralOffset

			// Velocity kicks backward and up
			const speed = Math.min(cfg.maxSpeed, spinRate * wheelRadius * cfg.speedMultiplier)
			system.velocityX[i] = -forwardDir.x * spinDir * speed + (Math.random() - 0.5) * cfg.randomness
			system.velocityY[i] = speed * cfg.upwardMultiplier + (Math.random() - 0.5) * cfg.upwardVariance
			system.velocityZ[i] = -forwardDir.z * spinDir * speed + (Math.random() - 0.5) * cfg.randomness

			system.initialSize[i] = cfg.sizeMin + Math.random() * cfg.sizeRange
		}
	}

	// Update water particles - gravity + slight drag
	const updateWaterSystem = (system, geomRef, delta) => {
		if (system.activeCount === 0) return

		const cfg = WATER_CONFIG
		let activeCount = 0

		for (let i = 0; i < cfg.maxParticles; i++) {
			if (!system.active[i]) continue

			system.life[i] += delta
			if (system.life[i] > system.maxLife[i]) {
				system.active[i] = 0
				system.sizes[i] = 0
				continue
			}

			activeCount++
			const i3 = i * 3

			// Apply gravity and drag
			system.velocityY[i] -= 9.8 * delta
			system.velocityX[i] *= 0.99
			system.velocityZ[i] *= 0.99

			// Update position
			system.positions[i3] += system.velocityX[i] * delta
			system.positions[i3 + 1] += system.velocityY[i] * delta
			system.positions[i3 + 2] += system.velocityZ[i] * delta

			// Size stays constant, opacity fades
			const lifeRatio = system.life[i] / system.maxLife[i]
			system.sizes[i] = system.initialSize[i]
			system.opacities[i] = (1.0 - lifeRatio) * 0.8
		}

		system.activeCount = activeCount
		geomRef.current.attributes.position.needsUpdate = true
		geomRef.current.attributes.size.needsUpdate = true
		geomRef.current.attributes.opacity.needsUpdate = true
	}

	// Update dust particles - drag only, grows over time
	const updateDustSystem = (system, geomRef, delta) => {
		if (system.activeCount === 0) return

		const cfg = DUST_CONFIG
		let activeCount = 0

		for (let i = 0; i < cfg.maxParticles; i++) {
			if (!system.active[i]) continue

			system.life[i] += delta
			if (system.life[i] > system.maxLife[i]) {
				system.active[i] = 0
				system.sizes[i] = 0
				continue
			}

			activeCount++
			const i3 = i * 3

			// Apply drag
			system.velocityX[i] *= 0.97
			system.velocityY[i] *= 0.97
			system.velocityZ[i] *= 0.97

			// Update position
			system.positions[i3] += system.velocityX[i] * delta
			system.positions[i3 + 1] += system.velocityY[i] * delta
			system.positions[i3 + 2] += system.velocityZ[i] * delta

			// Size grows, opacity fades quadratically
			const lifeRatio = system.life[i] / system.maxLife[i]
			system.sizes[i] = system.initialSize[i] * (1 + lifeRatio * 6.0)
			system.opacities[i] = 1.0 - lifeRatio * lifeRatio
		}

		system.activeCount = activeCount
		geomRef.current.attributes.position.needsUpdate = true
		geomRef.current.attributes.size.needsUpdate = true
		geomRef.current.attributes.opacity.needsUpdate = true
	}

	useFrame((state, delta) => {
		if (!vehicleController.current) return
		if (!waterGeomRef.current || !dustGeomRef.current) return

		const controller = vehicleController.current

		// Get chassis velocity and orientation
		let speed = 0
		try {
			const vel = controller.chassis().linvel()
			speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z)

			const rot = controller.chassis().rotation()
			tempQuat.set(rot.x, rot.y, rot.z, rot.w)
			forwardDir.set(0, 0, -1).applyQuaternion(tempQuat)
			rightDir.set(1, 0, 0).applyQuaternion(tempQuat)
		} catch {
			return
		}

		// Process each wheel
		for (let wi = 0; wi < wheelRefs.length; wi++) {
			const wheelRef = wheelRefs[wi]
			if (!wheelRef.current) continue

			// Compute angular velocity from rotation delta
			const currentRotation = controller.wheelRotation(wi) || 0
			const angularVel = delta > 0 ? (currentRotation - prevWheelRotations.current[wi]) / delta : 0
			prevWheelRotations.current[wi] = currentRotation

			wheelRef.current.getWorldPosition(tempVec)
			const wheelCenterY = tempVec.y
			const wheelBottomY = wheelCenterY - wheelRadius
			const wheelTopY = wheelCenterY + wheelRadius
			const inWater = wheelBottomY < WATER_LEVEL
			const fullySubmerged = wheelTopY < WATER_LEVEL
			const onGround = controller.wheelIsInContact(wi)

			// Water spray when partially submerged
			if (inWater && !fullySubmerged) {
				spawnWaterParticles(waterSystem.current, angularVel, wheelCenterY, tempVec.x, tempVec.z)
			}

			// Dust when on dry ground and moving
			if (onGround && !inWater && speed > 2) {
				const spinDir = angularVel >= 0 ? 1 : -1
				const spawnX = tempVec.x + forwardDir.x * wheelRadius * 0.7 * spinDir
				const spawnZ = tempVec.z + forwardDir.z * wheelRadius * 0.7 * spinDir
				spawnDustParticles(dustSystem.current, angularVel, spawnX, wheelBottomY, spawnZ)
			}
		}

		// Update particle systems
		updateWaterSystem(waterSystem.current, waterGeomRef, delta)
		updateDustSystem(dustSystem.current, dustGeomRef, delta)
	})

	return (
		<>
			{/* Water particles */}
			<points frustumCulled={false}>
				<bufferGeometry ref={waterGeomRef}>
					<bufferAttribute attach='attributes-position' count={WATER_CONFIG.maxParticles} array={waterSystem.current.positions} itemSize={3} />
					<bufferAttribute attach='attributes-size' count={WATER_CONFIG.maxParticles} array={waterSystem.current.sizes} itemSize={1} />
					<bufferAttribute attach='attributes-opacity' count={WATER_CONFIG.maxParticles} array={waterSystem.current.opacities} itemSize={1} />
				</bufferGeometry>
				<shaderMaterial transparent depthWrite={false} blending={NormalBlending} vertexShader={PARTICLE_VERTEX_SHADER} fragmentShader={WATER_FRAGMENT_SHADER} />
			</points>

			{/* Dust particles */}
			<points frustumCulled={false}>
				<bufferGeometry ref={dustGeomRef}>
					<bufferAttribute attach='attributes-position' count={DUST_CONFIG.maxParticles} array={dustSystem.current.positions} itemSize={3} />
					<bufferAttribute attach='attributes-size' count={DUST_CONFIG.maxParticles} array={dustSystem.current.sizes} itemSize={1} />
					<bufferAttribute attach='attributes-opacity' count={DUST_CONFIG.maxParticles} array={dustSystem.current.opacities} itemSize={1} />
				</bufferGeometry>
				<shaderMaterial
					transparent
					depthWrite={false}
					blending={NormalBlending}
					uniforms={{ uTexture: { value: sandTexture } }}
					vertexShader={PARTICLE_VERTEX_SHADER}
					fragmentShader={DUST_FRAGMENT_SHADER}
				/>
			</points>
		</>
	)
}

export default WheelParticles
