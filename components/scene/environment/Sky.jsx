import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { BackSide } from 'three'

import { sunDirection, sunColor, skyColorZenith, skyColorHorizon } from '../../../config/environment'
import skyVertexShader from '../../../shaders/sky.vert.glsl'
import skyFragmentShader from '../../../shaders/sky.frag.glsl'

// Custom Atmospheric Sky component with procedural clouds
// Uses shared atmosphere config for consistency with water shader
const AtmosphericSky = () => {
	const groupRef = useRef()
	const materialRef = useRef()

	const uniforms = useMemo(
		() => ({
			uTime: { value: 0 },
			uSunDirection: { value: sunDirection.clone() },
			uSunColor: { value: sunColor.clone() },
			uSkyColor: { value: skyColorZenith.clone() },
			uSkyHorizonColor: { value: skyColorHorizon.clone() },
		}),
		[]
	)

	useFrame((state) => {
		if (materialRef.current) {
			materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
		}
		// Make sky follow camera so it appears infinite
		if (groupRef.current) {
			groupRef.current.position.copy(state.camera.position)
		}
	})

	return (
		<group ref={groupRef}>
			<Environment files='assets/images/envmap/qwantani_1k.hdr' environmentIntensity={0.3} />

			<hemisphereLight args={[skyColorZenith, skyColorHorizon, 0.8]} />

			<ambientLight intensity={0.4} />

			<mesh scale={[1, 1, 1]}>
				<sphereGeometry args={[500, 16, 16]} />
				<shaderMaterial ref={materialRef} uniforms={uniforms} vertexShader={skyVertexShader} fragmentShader={skyFragmentShader} side={BackSide} depthWrite={false} />
			</mesh>
		</group>
	)
}

export default AtmosphericSky
