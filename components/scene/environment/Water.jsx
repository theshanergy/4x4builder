import { useRef, useMemo, useEffect } from 'react'
import { Vector3, Vector2, PlaneGeometry, TextureLoader, RepeatWrapping } from 'three'
import { useFrame, extend } from '@react-three/fiber'
import { Water as StdWater } from 'three-stdlib'

import { WATER_LEVEL } from '../../../config/water'
import { sunDirection, sunColor, skyColorZenith, skyColorHorizon } from '../../../config/environment'

import vertexShader from '../../../shaders/water.vert.glsl'
import fragmentShader from '../../../shaders/water.frag.glsl'

extend({ Water: StdWater })

// Water plane size - large enough to cover visible area plus buffer
const WATER_SIZE = 4096

// Gerstner wave configuration - matching the example exactly
const WAVES = [
	{ direction: 0, steepness: 0.15, wavelength: 100 },
	{ direction: 30, steepness: 0.15, wavelength: 50 },
	{ direction: 60, steepness: 0.15, wavelength: 25 },
]

// Gerstner Wave calculation for buoyancy
export const getWaveInfo = (x, z, time) => {
	const pos = new Vector3()
	const tangent = new Vector3(1, 0, 0)
	const binormal = new Vector3(0, 0, 1)

	WAVES.forEach((w) => {
		const k = (Math.PI * 2.0) / w.wavelength
		const c = Math.sqrt(9.8 / k)
		const d = new Vector2(Math.sin((w.direction * Math.PI) / 180), -Math.cos((w.direction * Math.PI) / 180))
		const f = k * (d.dot(new Vector2(x, z)) - c * time)
		const a = w.steepness / k

		pos.x += d.x * (a * Math.cos(f))
		pos.y += a * Math.sin(f)
		pos.z += d.y * (a * Math.cos(f))

		tangent.x += -d.x * d.x * (w.steepness * Math.sin(f))
		tangent.y += d.x * (w.steepness * Math.cos(f))
		tangent.z += -d.x * d.y * (w.steepness * Math.sin(f))

		binormal.x += -d.x * d.y * (w.steepness * Math.sin(f))
		binormal.y += d.y * (w.steepness * Math.cos(f))
		binormal.z += -d.y * d.y * (w.steepness * Math.sin(f))
	})

	const normal = binormal.cross(tangent).normalize()
	return { position: pos, normal: normal }
}

const Water = () => {
	const ref = useRef()

	// Create geometry and load water normals texture
	const waterGeometry = useMemo(() => new PlaneGeometry(WATER_SIZE, WATER_SIZE, 256, 256), [])
	const waterNormals = useMemo(() => {
		const textureLoader = new TextureLoader()
		const texture = textureLoader.load('/assets/images/ground/water_normal.jpg')
		texture.wrapS = texture.wrapT = RepeatWrapping
		return texture
	}, [])

	useEffect(() => {
		if (ref.current) {
			const water = ref.current

			// Configure shader with Gerstner waves - matching the example exactly
			water.material.onBeforeCompile = (shader) => {
				// Add custom uniforms for Gerstner waves and infinite water
				shader.uniforms.offsetX = { value: 0 }
				shader.uniforms.offsetZ = { value: 0 }
				shader.uniforms.waveA = {
					value: [Math.sin((WAVES[0].direction * Math.PI) / 180), Math.cos((WAVES[0].direction * Math.PI) / 180), WAVES[0].steepness, WAVES[0].wavelength],
				}
				shader.uniforms.waveB = {
					value: [Math.sin((WAVES[1].direction * Math.PI) / 180), Math.cos((WAVES[1].direction * Math.PI) / 180), WAVES[1].steepness, WAVES[1].wavelength],
				}
				shader.uniforms.waveC = {
					value: [Math.sin((WAVES[2].direction * Math.PI) / 180), Math.cos((WAVES[2].direction * Math.PI) / 180), WAVES[2].steepness, WAVES[2].wavelength],
				}

				// Add sky shader uniforms for realistic reflections
				shader.uniforms.skyColor = { value: skyColorZenith.clone() }
				shader.uniforms.skyHorizonColor = { value: skyColorHorizon.clone() } // Use imported shaders
				shader.vertexShader = vertexShader
				shader.fragmentShader = fragmentShader

				// Set the size uniform to 10.0 like the example
				shader.uniforms.size.value = 10.0
			}

			// Force material to recompile with the new onBeforeCompile
			water.material.needsUpdate = true
		}

		return () => {
			waterGeometry.dispose()
			waterNormals.dispose()
		}
	}, [waterGeometry, waterNormals])

	// Animate water
	useFrame((_, delta) => {
		if (ref.current) {
			ref.current.material.uniforms.time.value += delta
		}
	})

	return (
		<water
			ref={ref}
			args={[
				waterGeometry,
				{
					textureWidth: 512,
					textureHeight: 512,
					waterNormals: waterNormals,
					sunDirection: sunDirection,
					sunColor: sunColor,
					waterColor: 0x001e0f,
					distortionScale: 8,
					fog: undefined,
				},
			]}
			rotation-x={-Math.PI / 2}
			position={[0, WATER_LEVEL, 0]}
		/>
	)
}

export default Water
