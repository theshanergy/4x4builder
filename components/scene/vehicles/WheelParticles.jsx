import { useRef, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Vector3, NormalBlending, TextureLoader } from 'three'
import { vehicleState } from '../../../store/gameStore'
import { WATER_LEVEL } from '../../../config/water'

const MAX_DUST_PARTICLES = 500
const MAX_WATER_PARTICLES = 500

const WheelParticles = ({ vehicleController, wheelRefs }) => {
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

	// Water particle pool (bubbles and spray combined)
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
				isBubble: false,
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
		const isInWater = vehicleState.isInWater

		// Get vehicle speed
		let speed = 0
		let chassisVel = null
		try {
			chassisVel = controller.chassis().linvel()
			speed = Math.sqrt(chassisVel.x * chassisVel.x + chassisVel.y * chassisVel.y + chassisVel.z * chassisVel.z)
		} catch (e) {
			return
		}

		// Spawn particles
		const minSpeed = isInWater ? 1 : 2
		if (speed > minSpeed) {
			for (let wi = 0; wi < wheelRefs.length; wi++) {
				const wheelRef = wheelRefs[wi]
				const wheelInContact = controller.wheelIsInContact(wi)
				const shouldSpawn = (wheelInContact || isInWater) && wheelRef.current

				if (shouldSpawn) {
					wheelRef.current.getWorldPosition(tempVec)
					tempVec.y -= 0.3

					const prevPos = prevWheelPositions.current[wi]
					wheelVelocity.copy(tempVec).sub(prevPos)

					const speedFactor = Math.min((speed - minSpeed) / 15, 1.0)
					// In water, guarantee at least 1 particle; for dust, match original behavior (can be 0 at low speeds)
					const baseCount = Math.floor(speedFactor * speedFactor * 2 + 0.5)
					const particlesPerFrame = isInWater ? Math.max(1, baseCount) : baseCount

					for (let s = 0; s < particlesPerFrame; s++) {
						if (isInWater) {
							// Spawn water particles
							const p = waterParticles[nextWaterIndex.current]
							nextWaterIndex.current = (nextWaterIndex.current + 1) % MAX_WATER_PARTICLES

							p.active = true
							p.life = 0
							p.isBubble = s % 2 === 0

							if (p.isBubble) {
								// Bubble: underwater, rises
								p.maxLife = 1.5 + Math.random() * 2.0
								p.position.x = tempVec.x + (Math.random() - 0.5) * 0.5
								p.position.z = tempVec.z + (Math.random() - 0.5) * 0.5
								p.position.y = WATER_LEVEL - 0.3 - Math.random() * 0.8
								p.velocity.set(
									(Math.random() - 0.5) * 0.3,
									0.5 + Math.random() * 0.5,
									(Math.random() - 0.5) * 0.3
								)
								p.initialSize = Math.random() * 1.0 + 0.4
							} else {
								// Spray: above water, arcs
								p.maxLife = 0.5 + Math.random() * 0.5
								p.position.x = tempVec.x + (Math.random() - 0.5) * 0.3
								p.position.z = tempVec.z + (Math.random() - 0.5) * 0.3
								p.position.y = WATER_LEVEL + 0.05
								const spreadX = (Math.random() - 0.5) * 1.5 - chassisVel.x * 0.2
								const spreadZ = (Math.random() - 0.5) * 1.5 - chassisVel.z * 0.2
								p.velocity.set(spreadX, 1.5 + Math.random() * 1.5, spreadZ)
								p.initialSize = Math.random() * 0.5 + 0.2
							}
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

							const sideOffset = (Math.random() - 0.5) * 0.6
							p.position.x += sideOffset
							p.position.z += (Math.random() - 0.5) * 0.6
							p.position.y += Math.random() * 0.05

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

		// Update water particles
		for (let i = 0; i < MAX_WATER_PARTICLES; i++) {
			const p = waterParticles[i]
			if (p.active) {
				p.life += delta

				let shouldKill = p.life > p.maxLife
				if (p.isBubble && p.position.y >= WATER_LEVEL - 0.05) {
					shouldKill = true
				}

				if (shouldKill) {
					p.active = false
					waterSizes[i] = 0
					waterOpacities[i] = 0
				} else {
					p.position.addScaledVector(p.velocity, delta)

					const lifeRatio = p.life / p.maxLife

					if (p.isBubble) {
						p.velocity.y *= 0.99
						p.velocity.x += (Math.random() - 0.5) * 0.05
						p.velocity.z += (Math.random() - 0.5) * 0.05
						p.velocity.x *= 0.98
						p.velocity.z *= 0.98
						p.position.y = Math.min(p.position.y, WATER_LEVEL - 0.05)

						waterSizes[i] = p.initialSize
						const distToSurface = WATER_LEVEL - p.position.y
						waterOpacities[i] = Math.min(1.0 - lifeRatio * 0.3, distToSurface * 2.0)
					} else {
						p.velocity.y -= 9.8 * delta
						p.velocity.x *= 0.99
						p.velocity.z *= 0.99

						waterSizes[i] = p.initialSize
						waterOpacities[i] = (1.0 - lifeRatio) * 0.8
					}

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
				<shaderMaterial
					transparent
					depthWrite={false}
					blending={NormalBlending}
					vertexShader={waterShader.vertexShader}
					fragmentShader={waterShader.fragmentShader}
				/>
			</points>
		</>
	)
}

export default WheelParticles
