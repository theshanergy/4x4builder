import { useRef, useMemo, useEffect } from 'react'
import { CircleGeometry, ShaderMaterial, DoubleSide } from 'three'
import { useFrame } from '@react-three/fiber'
import { vehicleState } from '../../../store/gameStore'
import { sunDirection, sunColor, skyColorZenith, skyColorHorizon } from '../../../config/environment'
import { WATER_LEVEL } from '../../../config/water'
import { getFlowMap, FLOW_MAP_CONFIG } from '../../../utils/terrain/features/river'
import waterVertexShader from '../../../shaders/water.vert.glsl'
import waterFragmentShader from '../../../shaders/water.frag.glsl'

// Water plane size - large enough to cover visible area plus buffer
const WATER_RADIUS = 3000

// Procedural Water component
const Water = () => {
	const ref = useRef()

	// Get cached flow map texture
	const flowMap = getFlowMap()

	// Create large circular geometry once - segments for smooth edges
	const geom = useMemo(() => new CircleGeometry(WATER_RADIUS, 8), [])

	// Create shader material with shared atmosphere uniforms
	const material = useMemo(() => {
		const mat = new ShaderMaterial({
			uniforms: {
				uTime: { value: 0 },
				// Shared atmosphere uniforms
				uSunDirection: { value: sunDirection },
				uSunColor: { value: sunColor },
				uSkyColor: { value: skyColorZenith },
				uSkyHorizonColor: { value: skyColorHorizon },
				// Flow map for water movement
				uFlowMap: { value: flowMap },
				uFlowMapSize: { value: FLOW_MAP_CONFIG.worldSize },
				// Water-specific parameters
				uDistortionScale: { value: 1.5 },
				uFlowSpeed: { value: 0.6 },
				uWaveSpeed: { value: 0.03 },
				uWaveScale: { value: 0.08 },
				uNormalStrength: { value: 0.12 },
				uOpacity: { value: 1 },
				uNearFade: { value: 20.0 },
				uFarFade: { value: 80.0 },
			},
			vertexShader: waterVertexShader,
			fragmentShader: waterFragmentShader,
			transparent: true,
			side: DoubleSide,
		})
		return mat
	}, [flowMap])

	// Dispose geometry, material, and flow map when component unmounts
	useEffect(() => {
		return () => {
			geom.dispose()
			material.dispose()
			flowMap.dispose()
		}
	}, [geom, material, flowMap])

	// Animate water and follow player
	useFrame((_, delta) => {
		if (ref.current?.material?.uniforms) {
			// Follow player position at Y=0
			ref.current.position.x = vehicleState.position.x
			ref.current.position.z = vehicleState.position.z

			ref.current.material.uniforms.uTime.value += delta
		}
	})

	return <mesh ref={ref} geometry={geom} material={material} rotation-x={-Math.PI / 2} position={[0, WATER_LEVEL, 0]} />
}

export default Water
