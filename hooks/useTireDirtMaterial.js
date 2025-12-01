import { useMemo, useRef, useEffect } from 'react'
import { Color } from 'three'
import noiseShader from '../shaders/noise.glsl'

const useTireDirtMaterial = ({ tireRadius, rimRadius, coverage = 0, dirtColor = '#5e4c3b', noiseScale = 25.0, opacity = 0.65 }) => {
	const uniformsRef = useRef({
		uDirtColor: { value: new Color(dirtColor) },
		uNoiseScale: { value: noiseScale },
		uDirtOpacity: { value: opacity },
		uTireRadius: { value: tireRadius },
		uRimRadius: { value: rimRadius },
		uCoverage: { value: coverage },
	})

	// Update uniforms when values change
	useEffect(() => {
		uniformsRef.current.uDirtColor.value.set(dirtColor)
		uniformsRef.current.uNoiseScale.value = noiseScale
		uniformsRef.current.uDirtOpacity.value = opacity
		uniformsRef.current.uTireRadius.value = tireRadius
		uniformsRef.current.uRimRadius.value = rimRadius
		uniformsRef.current.uCoverage.value = coverage
	}, [tireRadius, rimRadius, coverage, dirtColor, noiseScale, opacity])

	return useMemo(
		() => (shader) => {
			Object.assign(shader.uniforms, uniformsRef.current)

			shader.vertexShader = `varying vec3 vDirtPos;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDirtPos = position;')

			shader.fragmentShader = `
				uniform vec3 uDirtColor; uniform float uNoiseScale, uDirtOpacity, uTireRadius, uRimRadius, uCoverage;
				varying vec3 vDirtPos;
				${noiseShader}
				float getDirtMix(vec3 pos, float scale, float tireR, float rimR, float cov) {
					if (cov <= 0.0) return 0.0;
					float noise = fbm(pos * scale * 0.8) + snoise(pos * scale * 4.0) * 0.2;
					float radius = length(pos.xy);
					// Gradient from tire edge inward based on coverage
					float innerLimit = tireR - (tireR - rimR) * cov;
					float gradientRange = (tireR - innerLimit) * 0.8; // Wide gradient zone
					float radialGradient = smoothstep(innerLimit - gradientRange * 0.2, tireR, radius);
					// Combine noise with radial gradient for organic look
					float dirtAmount = radialGradient * (0.5 + noise * 0.5);
					return clamp(dirtAmount, 0.0, 1.0);
				}
				${shader.fragmentShader}`
				.replace(
					'#include <map_fragment>',
					`#include <map_fragment>
					float dirtMix = getDirtMix(vDirtPos, uNoiseScale, uTireRadius, uRimRadius, uCoverage);
					vec3 finalDirtColor = mix(uDirtColor, uDirtColor * 0.6, smoothstep(-0.5, 0.5, snoise(vDirtPos * uNoiseScale * 2.0)));
					diffuseColor.rgb = mix(diffuseColor.rgb, finalDirtColor, dirtMix * uDirtOpacity);`
				)
				.replace(
					'#include <roughnessmap_fragment>',
					`#include <roughnessmap_fragment>
					roughnessFactor = mix(roughnessFactor, 0.9, dirtMix * uDirtOpacity);`
				)
		},
		[] // Only create callback once, uniforms update via ref
	)
}

export default useTireDirtMaterial
