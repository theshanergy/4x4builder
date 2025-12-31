import { useRef, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Vector3, NormalBlending, TextureLoader, Quaternion } from 'three'
import { WATER_LEVEL } from '../../../config/water'

const MAX_DUST_PARTICLES = 500
const MAX_WATER_PARTICLES = 1500

const WheelParticles = ({ vehicleController, wheelRefs, wheelRadius = 0.35, wheelWidth = 0.3 }) => {
	const sandTexture = useLoader(TextureLoader, '/assets/images/ground/sand.jpg')
	const dustGeometryRef = useRef()
	const waterGeometryRef = useRef()

	// Track particle pool with index-based allocation
	const nextDustIndex = useRef(0)
	const nextWaterIndex = useRef(0)

	// Store previous wheel positions for interpolation
	const prevWheelPositions = useRef(wheelRefs.map(() => new Vector3()))
	const tempVec = useMemo(() => new Vector3(), [])
	const wheelVelocity = useMemo(() => new Vector3(), [])
	const tempQuat = useMemo(() => new Quaternion(), [])
	const forwardDir = useMemo(() => new Vector3(), [])
	const rightDir = useMemo(() => new Vector3(), [])

	// Dust particle pool
	const dustParticles = useMemo(() => {
		const data = []
		for (let i = 0; i < MAX_DUST_PARTICLES; i++) {
			data.push({
				active: false,
				position: new Vector3(),
				velocity: new Vector3(),
				life: 0,
				maxLife: 0,
				size: 0,
				initialSize: 0,
			})
		}
		return data
	}, [])

	// Water particle pool (spray only)
	const waterParticles = useMemo(() => {
		const data = []
		for (let i = 0; i < MAX_WATER_PARTICLES; i++) {
			data.push({
				active: false,
				position: new Vector3(),
				velocity: new Vector3(),
				life: 0,
				maxLife: 0,
				size: 0,
				initialSize: 0,
			})
		}
		return data
	}, [])

	// Dust geometry attributes
	const dustPositions = useMemo(() => new Float32Array(MAX_DUST_PARTICLES * 3), [])
	const dustSizes = useMemo(() => new Float32Array(MAX_DUST_PARTICLES), [])
	const dustOpacities = useMemo(() => new Float32Array(MAX_DUST_PARTICLES), [])

	// Water geometry attributes
	const waterPositions = useMemo(() => new Float32Array(MAX_WATER_PARTICLES * 3), [])
	const waterSizes = useMemo(() => new Float32Array(MAX_WATER_PARTICLES), [])
	const waterOpacities = useMemo(() => new Float32Array(MAX_WATER_PARTICLES), [])

	// Dust shader - samples ground texture
	const dustShader = useMemo(
		() => ({
			uniforms: {
				uTexture: { value: sandTexture },
			},
			vertexShader: `
				attribute float size;
				attribute float opacity;
				varying float vOpacity;
				void main() {
					vOpacity = opacity;
					vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
					gl_PointSize = size * (450.0 / -mvPosition.z);
					gl_Position = projectionMatrix * mvPosition;
				}
			`,
			fragmentShader: `
				uniform sampler2D uTexture;
				varying float vOpacity;

				void main() {
					vec2 uv = gl_PointCoord.xy - 0.5;
					float r = length(uv);
					if (r > 0.5) discard;

					// Sample texture for ground color
					vec3 texColor = vec3(0.0);
					texColor += texture2D(uTexture, vec2(0.25, 0.25)).rgb;
					texColor += texture2D(uTexture, vec2(0.75, 0.25)).rgb;
					texColor += texture2D(uTexture, vec2(0.25, 0.75)).rgb;
					texColor += texture2D(uTexture, vec2(0.75, 0.75)).rgb;
					texColor += texture2D(uTexture, vec2(0.5, 0.5)).rgb;
					texColor /= 5.0;

					// Desaturate to simulate airborne dust
					float luminance = dot(texColor, vec3(0.299, 0.587, 0.114));
					vec3 finalColor = mix(texColor, vec3(luminance), 0.3);

					// Soft gaussian-like falloff
					float alpha = exp(-r * r * 8.0) * 0.1;
					float finalAlpha = vOpacity * alpha;

					gl_FragColor = vec4(finalColor, finalAlpha);
				}
			`,
		}),
		[sandTexture]
	)

	// Water shader - simple soft white particles
	const waterShader = useMemo(
		() => ({
			vertexShader: `
				attribute float size;
				attribute float opacity;
				varying float vOpacity;
				void main() {
					vOpacity = opacity;
					vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
					gl_PointSize = size * (450.0 / -mvPosition.z);
					gl_Position = projectionMatrix * mvPosition;
				}
			`,
			fragmentShader: `
				varying float vOpacity;

				void main() {
					vec2 uv = gl_PointCoord.xy - 0.5;
					float r = length(uv);
					if (r > 0.5) discard;

					// Soft edge falloff
					float alpha = 1.0 - smoothstep(0.3, 0.5, r);

					// Subtle white/very light blue
					vec3 color = vec3(0.95, 0.97, 1.0);

					float finalAlpha = vOpacity * alpha * 0.4;
					gl_FragColor = vec4(color, finalAlpha);
				}
			`,
		}),
		[]
	)

	useFrame((state, delta) => {
		if (!vehicleController.current) return
		if (!dustGeometryRef.current || !waterGeometryRef.current) return

		const controller = vehicleController.current

		// Get vehicle speed and chassis orientation
		let speed = 0
		let chassisVel = null
		try {
			chassisVel = controller.chassis().linvel()
			speed = Math.sqrt(chassisVel.x * chassisVel.x + chassisVel.y * chassisVel.y + chassisVel.z * chassisVel.z)

			// Get chassis rotation to determine forward and right directions
			const chassisRotation = controller.chassis().rotation()
			tempQuat.set(chassisRotation.x, chassisRotation.y, chassisRotation.z, chassisRotation.w)

			// Forward is -Z in local space (typical vehicle forward)
			forwardDir.set(0, 0, -1).applyQuaternion(tempQuat)
			// Right is +X in local space
			rightDir.set(1, 0, 0).applyQuaternion(tempQuat)
		} catch (e) {
			return
		}

		// Spawn particles
		if (speed > 1) {
			for (let wi = 0; wi < wheelRefs.length; wi++) {
				const wheelRef = wheelRefs[wi]
				const wheelInContact = controller.wheelIsInContact(wi)

				if (wheelRef.current) {
					wheelRef.current.getWorldPosition(tempVec)

					// Check if this specific wheel's bottom is in water
					const wheelBottomY = tempVec.y - wheelRadius
					const wheelIsInWater = wheelBottomY < WATER_LEVEL

					const shouldSpawn = wheelInContact || wheelIsInWater

					if (shouldSpawn) {
						tempVec.y = wheelBottomY

						const prevPos = prevWheelPositions.current[wi]
						wheelVelocity.copy(tempVec).sub(prevPos)

						const minSpeed = wheelIsInWater ? 1 : 2
						const speedFactor = Math.min((speed - minSpeed) / 15, 1.0)
						// In water, guarantee at least 2 particles and spawn more for better spray effect
						const baseCount = Math.floor(speedFactor * speedFactor * 2 + 0.5)
						const particlesPerFrame = wheelIsInWater ? Math.max(2, baseCount * 3) : baseCount

						for (let s = 0; s < particlesPerFrame; s++) {
							if (wheelIsInWater) {
								// Spawn spray particles at the tire surface where it meets water
								const p = waterParticles[nextWaterIndex.current]
								nextWaterIndex.current = (nextWaterIndex.current + 1) % MAX_WATER_PARTICLES

								p.active = true
								p.life = 0
								p.maxLife = 0.5 + Math.random() * 0.5

								// Get wheel center position
								wheelRef.current.getWorldPosition(tempVec)
								const wheelCenterY = tempVec.y

								// Calculate how deep the wheel is submerged
								const submersionDepth = wheelCenterY - WATER_LEVEL
								const clampedDepth = Math.max(-wheelRadius, Math.min(wheelRadius, submersionDepth))

								// Calculate angle where tire meets water surface at the BACK
								// Angle 0 = front, π/2 = top, π = back, 3π/2 = bottom
								// We want the back-bottom quadrant where water is flung off (π to 3π/2)
								// First find where the tire surface intersects water level
								const waterLineAngle = Math.asin(-clampedDepth / wheelRadius)
								// The back intersection is at π - waterLineAngle (back-bottom area)
								const backBottomAngle = Math.PI - waterLineAngle

								// Add variation around the back-bottom spray zone
								const angleVariation = (Math.random() - 0.5) * 0.5
								const spawnAngle = backBottomAngle + angleVariation

								// Calculate spawn position on tire surface
								const offsetY = Math.sin(spawnAngle) * wheelRadius
								const offsetBackward = -Math.cos(spawnAngle) * wheelRadius

								// Position at tire surface using chassis orientation
								// Back direction is opposite of forward
								const backDirX = -forwardDir.x
								const backDirZ = -forwardDir.z

								// Spread spray across tire width using right direction
								const lateralOffset = (Math.random() - 0.5) * wheelWidth
								p.position.x = tempVec.x + backDirX * offsetBackward + rightDir.x * lateralOffset + (Math.random() - 0.5) * 0.1
								// Ensure spray spawns at or above water level
								p.position.y = Math.max(WATER_LEVEL, wheelCenterY + offsetY)
								p.position.z = tempVec.z + backDirZ * offsetBackward + rightDir.z * lateralOffset + (Math.random() - 0.5) * 0.1

								// Direction is backward + outward from wheel
								const tangentUpward = Math.cos(spawnAngle) // More upward when closer to water line
								const tangentBackward = Math.sin(spawnAngle) // More backward when deeper

								const flingSpeed = 2.0 + Math.random() * 1.5
								const spreadX = (Math.random() - 0.5) * 0.8 + backDirX * flingSpeed * tangentBackward
								const spreadZ = (Math.random() - 0.5) * 0.8 + backDirZ * flingSpeed * tangentBackward
								const spreadY = 1.0 + Math.random() * 1.0 + tangentUpward * 1.5

								p.velocity.set(spreadX, spreadY, spreadZ)
								p.initialSize = Math.random() * 0.15 + 0.05
								p.size = p.initialSize
							} else {
								// Spawn dust particles
								const p = dustParticles[nextDustIndex.current]
								nextDustIndex.current = (nextDustIndex.current + 1) % MAX_DUST_PARTICLES

								p.active = true
								p.life = 0
								p.maxLife = 1.5 + Math.random() * 2.0

								const t = particlesPerFrame > 1 ? s / (particlesPerFrame - 1) : 0.5
								p.position.lerpVectors(prevPos, tempVec, t)

								// Spread particles across tire width
								const lateralOffset = (Math.random() - 0.5) * wheelWidth
								const sideOffset = (Math.random() - 0.5) * 0.6
								p.position.x += sideOffset + lateralOffset
								const inheritFactor = 0.3 + Math.random() * 0.15
								p.velocity.set(
									-chassisVel.x * inheritFactor + sideOffset * 2.0,
									Math.random() * 0.3 + 0.1,
									-chassisVel.z * inheritFactor + (Math.random() - 0.5) * 0.5
								)

								p.initialSize = Math.random() * 2.5 + 1.5
								p.size = p.initialSize
							}
						}

						prevPos.copy(tempVec)
					}
				}
			}
		}

		// Update dust particles
		for (let i = 0; i < MAX_DUST_PARTICLES; i++) {
			const p = dustParticles[i]
			if (p.active) {
				p.life += delta
				if (p.life > p.maxLife) {
					p.active = false
					dustSizes[i] = 0
					dustOpacities[i] = 0
				} else {
					p.position.addScaledVector(p.velocity, delta)

					const drag = 0.97
					p.velocity.x *= drag
					p.velocity.y *= drag
					p.velocity.z *= drag

					const lifeRatio = p.life / p.maxLife
					dustSizes[i] = p.initialSize * (1 + lifeRatio * 6.0)
					dustOpacities[i] = 1.0 - lifeRatio * lifeRatio

					dustPositions[i * 3] = p.position.x
					dustPositions[i * 3 + 1] = p.position.y
					dustPositions[i * 3 + 2] = p.position.z
				}
			}
		}

		// Update water particles (spray only)
		for (let i = 0; i < MAX_WATER_PARTICLES; i++) {
			const p = waterParticles[i]
			if (p.active) {
				p.life += delta

				if (p.life > p.maxLife) {
					p.active = false
					waterSizes[i] = 0
					waterOpacities[i] = 0
				} else {
					p.position.addScaledVector(p.velocity, delta)

					const lifeRatio = p.life / p.maxLife

					// Spray: gravity arc
					p.velocity.y -= 9.8 * delta
					p.velocity.x *= 0.99
					p.velocity.z *= 0.99

					waterSizes[i] = p.initialSize
					waterOpacities[i] = (1.0 - lifeRatio) * 0.8

					waterPositions[i * 3] = p.position.x
					waterPositions[i * 3 + 1] = p.position.y
					waterPositions[i * 3 + 2] = p.position.z
				}
			}
		}

		// Mark attributes as needing update
		dustGeometryRef.current.attributes.position.needsUpdate = true
		dustGeometryRef.current.attributes.size.needsUpdate = true
		dustGeometryRef.current.attributes.opacity.needsUpdate = true

		waterGeometryRef.current.attributes.position.needsUpdate = true
		waterGeometryRef.current.attributes.size.needsUpdate = true
		waterGeometryRef.current.attributes.opacity.needsUpdate = true
	})

	return (
		<>
			{/* Dust particles */}
			<points frustumCulled={false}>
				<bufferGeometry ref={dustGeometryRef}>
					<bufferAttribute attach='attributes-position' count={MAX_DUST_PARTICLES} array={dustPositions} itemSize={3} />
					<bufferAttribute attach='attributes-size' count={MAX_DUST_PARTICLES} array={dustSizes} itemSize={1} />
					<bufferAttribute attach='attributes-opacity' count={MAX_DUST_PARTICLES} array={dustOpacities} itemSize={1} />
				</bufferGeometry>
				<shaderMaterial
					transparent
					depthWrite={false}
					blending={NormalBlending}
					uniforms={dustShader.uniforms}
					vertexShader={dustShader.vertexShader}
					fragmentShader={dustShader.fragmentShader}
				/>
			</points>

			{/* Water particles */}
			<points frustumCulled={false}>
				<bufferGeometry ref={waterGeometryRef}>
					<bufferAttribute attach='attributes-position' count={MAX_WATER_PARTICLES} array={waterPositions} itemSize={3} />
					<bufferAttribute attach='attributes-size' count={MAX_WATER_PARTICLES} array={waterSizes} itemSize={1} />
					<bufferAttribute attach='attributes-opacity' count={MAX_WATER_PARTICLES} array={waterOpacities} itemSize={1} />
				</bufferGeometry>
				<shaderMaterial transparent depthWrite={false} blending={NormalBlending} vertexShader={waterShader.vertexShader} fragmentShader={waterShader.fragmentShader} />
			</points>
		</>
	)
}

export default WheelParticles
