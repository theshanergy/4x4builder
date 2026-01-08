import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { BackSide, Vector3 } from 'three'

import { useBiomeEnvironment } from '../../../hooks/useBiome'
import skyVertexShader from '../../../shaders/sky.vert.glsl'
import skyFragmentShader from '../../../shaders/sky.frag.glsl'

// Custom Atmospheric Sky component with procedural clouds
// Uses shared atmosphere config for consistency with water shader
// Automatically follows camera position each frame
const AtmosphericSky = () => {
	const meshRef = useRef()
	const materialRef = useRef()

	// Get biome-specific environment config
	const { sunDirection, sunColor, skyColorZenith, skyColorHorizon } = useBiomeEnvironment()

	const uniforms = useMemo(
		() => ({
			uTime: { value: 0 },
			uSunDirection: { value: sunDirection.clone() },
			uSunColor: { value: sunColor.clone() },
			uSkyColor: { value: skyColorZenith.clone() },
			uSkyHorizonColor: { value: skyColorHorizon.clone() },
		}),
		[sunDirection, sunColor, skyColorZenith, skyColorHorizon]
	)

	const geometry = useMemo(() => {
		return [500, 8, 8]
	}, [])

	useFrame((state) => {
		const mesh = meshRef.current
		if (!mesh) return

		// Update sky position to match camera position
		mesh.position.copy(state.camera.position)

		// Update time uniform for animated clouds
		if (materialRef.current) {
			materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
		}
	})

	return (
		<group>
			<Environment files='assets/images/envmap/rustig_koppie_puresky_1k.hdr' environmentIntensity={0.3} />

			<ambientLight intensity={2.0} color={skyColorZenith} />

			<mesh ref={meshRef} frustumCulled={false}>
				<sphereGeometry args={geometry} />
				<shaderMaterial ref={materialRef} uniforms={uniforms} vertexShader={skyVertexShader} fragmentShader={skyFragmentShader} side={BackSide} depthWrite={false} />
			</mesh>
		</group>
	)
}

export default AtmosphericSky
