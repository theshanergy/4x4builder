import { useMemo } from 'react'
import { Color } from 'three'
import noiseShader from '../shaders/noise.glsl'

const useTireDirtMaterial = ({ tireRadius, rimRadius, coverage = 0.3, dirtColor = '#5e4c3b', noiseScale = 25.0, opacity = 0.65 }) => {
	return useMemo(
		() => (shader) => {
			Object.assign(shader.uniforms, {
				uDirtColor: { value: new Color(dirtColor) },
				uNoiseScale: { value: noiseScale },
				uDirtOpacity: { value: opacity },
				uTireRadius: { value: tireRadius },
				uRimRadius: { value: rimRadius },
				uCoverage: { value: coverage },
			})

			shader.vertexShader = `varying vec3 vDirtPos;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDirtPos = position;')

			shader.fragmentShader = `
				uniform vec3 uDirtColor; uniform float uNoiseScale, uDirtOpacity, uTireRadius, uRimRadius, uCoverage;
				varying vec3 vDirtPos;
				${noiseShader}
				float getDirtMix(vec3 pos, float scale, float tireR, float rimR, float cov) {
					float noise = fbm(pos * scale * 0.8) + snoise(pos * scale * 4.0) * 0.2;
					float limit = tireR - (tireR - rimR) * cov;
					float radialBias = smoothstep(limit - 0.02, limit + 0.02, length(pos.xy));
					return clamp(smoothstep(0.0, 0.6, noise * 0.6 + radialBias * 0.9 - 0.2), 0.0, 1.0);
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
		[tireRadius, rimRadius, coverage, dirtColor, noiseScale, opacity]
	)
}

export default useTireDirtMaterial
