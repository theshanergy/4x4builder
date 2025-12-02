import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, Color, NormalBlending } from 'three'

const MAX_PARTICLES = 1000

const Dust = ({ vehicleController, wheelRefs, color = '#d9d0ba' }) => {
	const geometryRef = useRef()
	const materialRef = useRef()

	// Track particle pool with index-based allocation (avoids O(n) find())
	const nextParticleIndex = useRef(0)

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
				uColor: { value: new Color(color) },
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
            uniform vec3 uColor;
            varying float vOpacity;
            
            void main() {
                vec2 uv = gl_PointCoord.xy - 0.5;
                float r = length(uv);
                if (r > 0.5) discard;
                
                // Soft particle edge with gentler falloff
                float alpha = 1.0 - smoothstep(0.0, 0.5, r);
                
                float finalAlpha = vOpacity * alpha * 0.35;
                gl_FragColor = vec4(uColor, finalAlpha);
            }
        `,
		}),
		[]
	)

	// Update color uniform when prop changes
	useEffect(() => {
		if (materialRef.current) {
			materialRef.current.uniforms.uColor.value.set(color)
		}
	}, [color])

	useFrame((state, delta) => {
		if (!vehicleController.current || !geometryRef.current) return

		const controller = vehicleController.current

		// Get vehicle speed
		// Note: Rapier's linvel() returns the linear velocity of the rigid body
		let speed = 0
		try {
			const vel = controller.chassis().linvel()
			speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z)
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
				if (controller.wheelIsInContact(wi)) {
					// Spawn probability increases with speed
					const spawnChance = Math.min(speed * 0.1, 0.8) * (delta * 60) // Normalize to 60fps

					if (Math.random() < spawnChance) {
						// Get next particle using round-robin index (O(1) instead of O(n) find)
						const p = particles[nextParticleIndex.current]
						nextParticleIndex.current = (nextParticleIndex.current + 1) % MAX_PARTICLES

						p.active = true
						p.life = 0
						p.maxLife = 1.0 + Math.random() * 1.5 // 1-2.5 seconds

						// Get wheel position
						if (wheelRef.current) {
							wheelRef.current.getWorldPosition(p.position)
							// Lower it to ground level (wheel position is center of wheel)
							p.position.y -= 0.3

							// Add some randomness to position
							p.position.x += (Math.random() - 0.5) * 0.2
							p.position.z += (Math.random() - 0.5) * 0.2
						}

						// Velocity: slightly up, random direction but mostly opposite to movement?
						// Actually dust just puffs up and lingers.
						p.velocity.set(
							(Math.random() - 0.5) * 1.5,
							Math.random() * 1.5 + 1.0, // Stronger upward puff
							(Math.random() - 0.5) * 1.5
						)

						p.initialSize = Math.random() * 5.0 + 3.0 // Bigger particles
						p.size = p.initialSize
					}
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
					p.velocity.x *= 0.98
					p.velocity.y *= 0.98
					p.velocity.z *= 0.98

					// Update attributes
					positions[i * 3] = p.position.x
					positions[i * 3 + 1] = p.position.y
					positions[i * 3 + 2] = p.position.z

					const lifeRatio = p.life / p.maxLife
					sizes[i] = p.initialSize * (1 + lifeRatio * 4.0) // Grow even more
					opacities[i] = 1.0 - Math.pow(lifeRatio, 0.5) // Fade out
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
