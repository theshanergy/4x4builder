import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { BackSide } from 'three'

import ENVIRONMENT_CONFIG from '../../../config/environment'
import { QUADTREE_VIEW_RANGE, QUADTREE_ROOT_SIZE } from '../../../config/lod'

import skyVertexShader from '../../../shaders/sky.vert.glsl'
import skyFragmentShader from '../../../shaders/sky.frag.glsl'

// Custom Atmospheric Sky component with procedural clouds
// Uses shared atmosphere config for consistency with water shader
// Automatically follows camera position each frame
const AtmosphericSky = () => {
	const meshRef = useRef()
	const materialRef = useRef()

	// Get environment config
	const { sunDirection, sunColor, skyColorZenith, skyColorHorizon } = ENVIRONMENT_CONFIG

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

	const fogDistance = useMemo(() => {
		return QUADTREE_VIEW_RANGE * QUADTREE_ROOT_SIZE - QUADTREE_ROOT_SIZE * 0.5
	}, [])

	const skyGeometry = useMemo(() => {
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
		<>
			<Environment files='assets/images/envmap/rustig_koppie_puresky_1k.hdr' environmentIntensity={0.3} />

			<ambientLight intensity={2.0} color={skyColorZenith} />

			<fog attach='fog' args={[skyColorHorizon, fogDistance * 0.2, fogDistance]} />

			<mesh ref={meshRef} frustumCulled={false}>
				<sphereGeometry args={skyGeometry} />
				<shaderMaterial ref={materialRef} uniforms={uniforms} vertexShader={skyVertexShader} fragmentShader={skyFragmentShader} side={BackSide} depthWrite={false} />
			</mesh>
		</>
	)
}

export default AtmosphericSky
