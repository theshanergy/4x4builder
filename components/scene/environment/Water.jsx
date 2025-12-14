import { memo, useRef, useMemo } from 'react'
import { Color, TextureLoader, RepeatWrapping, PlaneGeometry, ShaderMaterial, UniformsUtils, DoubleSide } from 'three'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { sunDirection } from '../../../store/gameStore'
import waterVertexShader from '../../../shaders/water.vert.glsl'
import waterFragmentShader from '../../../shaders/water.frag.glsl'

// Simple, performant ocean water shader - no render-to-texture, just animated normals + fresnel
const WaterMaterial = {
	uniforms: {
		uTime: { value: 0 },
		uNormalMap: { value: null },
		uEnvMap: { value: null },
		uWaterColor: { value: new Color(0x20c4d4) }, // Bright tropical turquoise
		uDeepColor: { value: new Color(0x0a6e7a) }, // Rich tropical teal
		uSunDirection: { value: sunDirection },
		uSunColor: { value: new Color(0xfffaf0) }, // Warm sunlight
		uDistortionScale: { value: 3.5 },
		uWaveSpeed: { value: 0.025 },
		uWaveScale: { value: 0.12 },
		uOpacity: { value: 0.85 },
		uShoreRadius: { value: 0 }, // Where water starts (set from props)
		uNearFade: { value: 10.0 }, // Distance from shore where water is fully transparent
		uFarFade: { value: 50.0 }, // Distance from shore where water is fully opaque
	},
	vertexShader: waterVertexShader,
	fragmentShader: waterFragmentShader,
}

// WaterTile component using custom performant shader
const WaterTile = memo(({ position, tileSize, oceanRadius, oceanTransition }) => {
	const ref = useRef()
	const { scene } = useThree()

	// Load water normal map texture
	const waterNormals = useLoader(TextureLoader, '/assets/images/ground/water_normal.jpg')
	waterNormals.wrapS = waterNormals.wrapT = RepeatWrapping

	// Create geometry once
	const geom = useMemo(() => new PlaneGeometry(tileSize, tileSize, 1, 1), [tileSize])

	// Create shader material
	const material = useMemo(() => {
		const mat = new ShaderMaterial({
			uniforms: UniformsUtils.clone(WaterMaterial.uniforms),
			vertexShader: WaterMaterial.vertexShader,
			fragmentShader: WaterMaterial.fragmentShader,
			transparent: true,
			side: DoubleSide,
		})
		mat.uniforms.uNormalMap.value = waterNormals
		mat.uniforms.uShoreRadius.value = oceanRadius - oceanTransition
		return mat
	}, [waterNormals, oceanRadius, oceanTransition])

	// Animate water and update envmap from scene
	useFrame((_, delta) => {
		if (ref.current?.material?.uniforms) {
			ref.current.material.uniforms.uTime.value += delta
			// Use scene environment map if available
			if (scene.environment) {
				ref.current.material.uniforms.uEnvMap.value = scene.environment
			}
		}
	})

	return <mesh ref={ref} geometry={geom} material={material} rotation-x={-Math.PI / 2} position={position} />
})

export default WaterTile
