import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Vector3 } from 'three'
import skyVertexShader from '../../shaders/sky.vert.glsl'
import skyFragmentShader from '../../shaders/sky.frag.glsl'

// Custom Atmospheric Sky component with procedural clouds
const AtmosphericSky = ({ sunPosition = [1, 0.5, 1] }) => {
	const meshRef = useRef()
	const materialRef = useRef()

	const sunDir = useMemo(() => new Vector3(...sunPosition).normalize(), [sunPosition])

	const uniforms = useMemo(
		() => ({
			sunDirection: { value: sunDir },
			time: { value: 0 },
		}),
		[sunDir]
	)

	useFrame((state) => {
		if (materialRef.current) {
			materialRef.current.uniforms.time.value = state.clock.elapsedTime
		}
		// Make sky follow camera so it appears infinite
		if (meshRef.current) {
			meshRef.current.position.copy(state.camera.position)
		}
	})

	return (
		<mesh ref={meshRef} scale={[1, 1, 1]}>
			<sphereGeometry args={[500, 16, 16]} />
			<shaderMaterial
				ref={materialRef}
				uniforms={uniforms}
				vertexShader={skyVertexShader}
				fragmentShader={skyFragmentShader}
				side={BackSide}
				depthWrite={false}
			/>
		</mesh>
	)
}

export default AtmosphericSky
