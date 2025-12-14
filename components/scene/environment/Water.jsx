import { useRef, useMemo, useEffect, Suspense } from 'react'
import { Color, TextureLoader, RepeatWrapping, CircleGeometry, ShaderMaterial, DoubleSide } from 'three'
import { useFrame, useLoader } from '@react-three/fiber'
import { sunDirection, vehicleState } from '../../../store/gameStore'
import waterVertexShader from '../../../shaders/water.vert.glsl'
import waterFragmentShader from '../../../shaders/water.frag.glsl'

// Water plane size - large enough to cover visible area plus buffer
const WATER_RADIUS = 300

// Single large water plane that follows the player - inner component that uses loader
const WaterMesh = () => {
	const ref = useRef()

	// Load water normal map texture
	const waterNormals = useLoader(TextureLoader, '/assets/images/ground/water_normal.jpg')

	// Apply texture settings once loaded
	useEffect(() => {
		waterNormals.wrapS = waterNormals.wrapT = RepeatWrapping
	}, [waterNormals])

	// Create large circular geometry once - segments for smooth edges
	const geom = useMemo(() => new CircleGeometry(WATER_RADIUS, 64), [])

	// Create shader material with proper uniform initialization
	const material = useMemo(() => {
		const mat = new ShaderMaterial({
			uniforms: {
				uTime: { value: 0 },
				uNormalMap: { value: waterNormals },
				uWaterColor: { value: new Color().setHSL(0.52, 0.75, 0.48) },
				uDeepColor: { value: new Color().setHSL(0.52, 0.82, 0.26) },
				uSkyColor: { value: new Color().setHSL(0.57, 0.65, 0.55) }, // Blue sky
				uSkyHorizonColor: { value: new Color().setHSL(0.55, 0.35, 0.75) }, // Pale horizon
				uSunDirection: { value: sunDirection },
				uSunColor: { value: new Color().setHSL(0.13, 1.0, 0.97) },
				uDistortionScale: { value: 3.5 },
				uWaveSpeed: { value: 0.025 },
				uWaveScale: { value: 0.12 },
				uNormalStrength: { value: 0.1 },
				uOpacity: { value: 1 },
				uNearFade: { value: 30.0 },
				uFarFade: { value: 60.0 },
			},
			vertexShader: waterVertexShader,
			fragmentShader: waterFragmentShader,
			transparent: true,
			side: DoubleSide,
		})
		return mat
	}, [waterNormals])

	// Dispose geometry and material when component unmounts
	useEffect(() => {
		return () => {
			geom.dispose()
			material.dispose()
		}
	}, [geom, material])

	// Animate water and follow player
	useFrame((_, delta) => {
		if (ref.current?.material?.uniforms) {
			// Follow player position at Y=0
			ref.current.position.x = vehicleState.position.x
			ref.current.position.z = vehicleState.position.z

			ref.current.material.uniforms.uTime.value += delta
		}
	})

	return <mesh ref={ref} geometry={geom} material={material} rotation-x={-Math.PI / 2} position={[0, 0, 0]} />
}

// Wrapper component with Suspense to handle async texture loading
const Water = () => {
	return (
		<Suspense fallback={null}>
			<WaterMesh />
		</Suspense>
	)
}

export default Water
