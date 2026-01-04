import { useRef, useMemo, useEffect } from 'react'
import { CircleGeometry, ShaderMaterial, DoubleSide, DataTexture, RGBAFormat, FloatType } from 'three'
import { useFrame } from '@react-three/fiber'

import { sunDirection, sunColor, skyColorZenith, skyColorHorizon } from '../../../config/environment'
import { WATER_LEVEL, FLOW_MAP_CONFIG } from '../../../config/water'

import waterVertexShader from '../../../shaders/water.vert.glsl'
import waterFragmentShader from '../../../shaders/water.frag.glsl'

// Water plane size - large enough to cover visible area plus buffer
const WATER_RADIUS = 3000

/**
 * Create a simple procedural flow map for calm water.
 * In the infinite terrain system, water bodies are calm lakes/seas
 * without strong directional flow, so we use a neutral flow map.
 */
const createCalmFlowMap = () => {
	const resolution = FLOW_MAP_CONFIG.resolution
	const data = new Float32Array(resolution * resolution * 4)

	// Fill with neutral flow (0.5, 0.5 = no flow in normalized space)
	// Add very subtle variation for visual interest
	for (let i = 0; i < resolution * resolution; i++) {
		const idx = i * 4
		// Slight random variation for natural look
		data[idx] = 0.5 + (Math.random() - 0.5) * 0.05 // R: flow X
		data[idx + 1] = 0.5 + (Math.random() - 0.5) * 0.05 // G: flow Z
		data[idx + 2] = 1.0 // B: flow speed (calm)
		data[idx + 3] = 1.0 // A: unused
	}

	const texture = new DataTexture(data, resolution, resolution, RGBAFormat, FloatType)
	texture.needsUpdate = true
	return texture
}

// Procedural Water component
const Water = () => {
	const ref = useRef()

	// Create calm flow map for procedural water bodies
	const flowMap = useMemo(() => createCalmFlowMap(), [])

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
				uFlowSpeed: { value: 0.3 }, // Reduced for calmer water
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

	// Animate water and follow camera
	useFrame(({ camera }, delta) => {
		if (ref.current?.material?.uniforms) {
			// Follow camera position at Y=0
			ref.current.position.x = camera.position.x
			ref.current.position.z = camera.position.z

			ref.current.material.uniforms.uTime.value += delta
		}
	})

	return <mesh ref={ref} geometry={geom} material={material} rotation-x={-Math.PI / 2} position={[0, WATER_LEVEL, 0]} />
}

export default Water
