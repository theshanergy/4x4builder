import { useRef, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Vector3, NormalBlending, TextureLoader } from 'three'

const MAX_PARTICLES = 1000

const Dust = ({ vehicleController, wheelRefs }) => {
	const sandTexture = useLoader(TextureLoader, '/assets/images/ground/sand.jpg')
	const geometryRef = useRef()
	const materialRef = useRef()

	// Track particle pool with index-based allocation (avoids O(n) find())
	const nextParticleIndex = useRef(0)

	// Store previous wheel positions for interpolation (continuous dust trail)
	const prevWheelPositions = useRef(wheelRefs.map(() => new Vector3()))
	const tempVec = useMemo(() => new Vector3(), [])
	const wheelVelocity = useMemo(() => new Vector3(), [])

	// Particle data structure
	// We use a plain object pool to avoid garbage collection
	const particles = useMemo(() => {
		const data = []
		for (let i = 0; i < MAX_PARTICLES; i++) {
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

	// Geometry attributes
	const positions = useMemo(() => new Float32Array(MAX_PARTICLES * 3), [])
	const sizes = useMemo(() => new Float32Array(MAX_PARTICLES), [])
	const opacities = useMemo(() => new Float32Array(MAX_PARTICLES), [])

	// Shader
	const shader = useMemo(
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
                
                // Sample texture at multiple points to get average color
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
                
                // Very soft gaussian-like falloff for smoother blending
                float alpha = exp(-r * r * 8.0);
                
                float finalAlpha = vOpacity * alpha * 0.1;
                gl_FragColor = vec4(finalColor, finalAlpha);
            }
        `,
		}),
		[sandTexture]
	)

	useFrame((state, delta) => {
		if (!vehicleController.current || !geometryRef.current) return

		const controller = vehicleController.current

		// Get vehicle speed
		// Note: Rapier's linvel() returns the linear velocity of the rigid body
		let speed = 0
		let chassisVel = null
		try {
			chassisVel = controller.chassis().linvel()
			speed = Math.sqrt(chassisVel.x * chassisVel.x + chassisVel.y * chassisVel.y + chassisVel.z * chassisVel.z)
		} catch (e) {
			// Handle case where chassis might not be ready
			return
		}

		// Spawn particles
		if (speed > 2) {
			// Only spawn if moving fast enough
			for (let wi = 0; wi < wheelRefs.length; wi++) {
				const wheelRef = wheelRefs[wi]
				// Check if wheel is touching ground
				if (controller.wheelIsInContact(wi) && wheelRef.current) {
					// Get current wheel position
					wheelRef.current.getWorldPosition(tempVec)
					tempVec.y -= 0.3 // Lower to ground level

					const prevPos = prevWheelPositions.current[wi]

					// Calculate wheel velocity for this frame
					wheelVelocity.copy(tempVec).sub(prevPos)
					const wheelSpeed = wheelVelocity.length() / Math.max(delta, 0.001)

					// Spawn rate based on speed - continuous spawning
					// Higher speed = more particles per frame for denser trail
					const speedFactor = Math.min((speed - 2) / 15, 1.0)
					const particlesPerFrame = Math.floor(speedFactor * speedFactor * 2 + 0.5) // 0-2 particles per wheel per frame

					for (let s = 0; s < particlesPerFrame; s++) {
						// Get next particle using round-robin index (O(1) instead of O(n) find)
						const p = particles[nextParticleIndex.current]
						nextParticleIndex.current = (nextParticleIndex.current + 1) % MAX_PARTICLES

						p.active = true
						p.life = 0
						p.maxLife = 1.5 + Math.random() * 2.0 // 1.5-3.5 seconds

						// Interpolate position along wheel path for continuous trail
						const t = particlesPerFrame > 1 ? s / (particlesPerFrame - 1) : 0.5
						p.position.lerpVectors(prevPos, tempVec, t)

						// Add small random offset for width - spread more to the sides
						const sideOffset = (Math.random() - 0.5) * 0.6
						p.position.x += sideOffset
						p.position.z += (Math.random() - 0.5) * 0.6
						p.position.y += Math.random() * 0.05

						// Velocity: inherit vehicle velocity to trail behind + spread outward
						// Dust gets left behind and spreads to sides, minimal upward rise
						const inheritFactor = 0.3 + Math.random() * 0.15
						p.velocity.set(
							-chassisVel.x * inheritFactor + sideOffset * 2.0, // Push outward to sides
							Math.random() * 0.3 + 0.1, // Very gentle upward
							-chassisVel.z * inheritFactor + (Math.random() - 0.5) * 0.5
						)

						// Smaller particles that grow more
						p.initialSize = Math.random() * 2.5 + 1.5
						p.size = p.initialSize
					}

					// Update previous position
					prevPos.copy(tempVec)
				}
			}
		}

		// Update particles
		for (let i = 0; i < MAX_PARTICLES; i++) {
			const p = particles[i]
			if (p.active) {
				p.life += delta
				if (p.life > p.maxLife) {
					p.active = false
					sizes[i] = 0
					opacities[i] = 0
				} else {
					// Move particle
					p.position.addScaledVector(p.velocity, delta)
					// Gradual slowdown (air resistance)
					const drag = 0.97
					p.velocity.x *= drag
					p.velocity.y *= drag
					p.velocity.z *= drag

					// Update attributes
					positions[i * 3] = p.position.x
					positions[i * 3 + 1] = p.position.y
					positions[i * 3 + 2] = p.position.z

					const lifeRatio = p.life / p.maxLife
					// Grow significantly over lifetime for that billowing cloud effect
					sizes[i] = p.initialSize * (1 + lifeRatio * 6.0)
					// Smooth fade out using ease-out curve
					opacities[i] = 1.0 - lifeRatio * lifeRatio
				}
			}
		}

		geometryRef.current.attributes.position.needsUpdate = true
		geometryRef.current.attributes.size.needsUpdate = true
		geometryRef.current.attributes.opacity.needsUpdate = true
	})

	return (
		<points frustumCulled={false}>
			<bufferGeometry ref={geometryRef}>
				<bufferAttribute attach='attributes-position' count={MAX_PARTICLES} array={positions} itemSize={3} />
				<bufferAttribute attach='attributes-size' count={MAX_PARTICLES} array={sizes} itemSize={1} />
				<bufferAttribute attach='attributes-opacity' count={MAX_PARTICLES} array={opacities} itemSize={1} />
			</bufferGeometry>
			<shaderMaterial
				ref={materialRef}
				transparent
				depthWrite={false}
				blending={NormalBlending}
				uniforms={shader.uniforms}
				vertexShader={shader.vertexShader}
				fragmentShader={shader.fragmentShader}
			/>
		</points>
	)
}

export default Dust
