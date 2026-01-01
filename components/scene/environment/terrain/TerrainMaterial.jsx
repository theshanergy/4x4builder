// Custom terrain shader material extending MeshStandardMaterial
// Adds height/slope/curvature-based color blending while preserving standard PBR lighting

import { useMemo, useRef } from 'react'
import { RepeatWrapping } from 'three'

// Terrain blending configuration
const CLIFF_CONFIG = {
	// Height blending (absolute world units)
	heightBlendStart: 4, // Height where cliff starts appearing
	heightBlendEnd: 60, // Height where cliff is fully visible
	heightInfluence: 0.8, // How much height affects cliff blend (0-1)

	// Slope blending
	slopeBlendStart: 0.1, // Slope threshold where cliff starts appearing
	slopeBlendEnd: 0.3, // Slope threshold where cliff is fully visible
	slopeInfluence: 0.9, // How much slope affects cliff blend (0-1)

	// Curvature blending
	curvatureScale: 50.0, // Multiplier for curvature detection sensitivity
	curvatureSoftness: 0.3, // Softness of curvature-based blending (higher = softer)
	ridgeInfluence: 0.5, // How much ridges (convex) show cliff texture (0-1)
	valleyDarkening: 0.3, // Maximum valley darkening amount (0-1)
	lowAreaDarkening: 0.1, // Darkening for low elevation areas (0-1)

	// Texture settings
	textureScale: 0.05, // World-space texture tiling scale
}

/**
 * TerrainMaterial - Extends MeshStandardMaterial with procedural terrain blending
 *
 * Features:
 * - Preserves standard PBR lighting (identical to meshStandardMaterial)
 * - Height-based color blending (sand in valleys, rock on peaks)
 * - Slope-based variation (steeper = more exposed rock)
 * - Curvature-based erosion patterns (ridges and valleys highlighted)
 */
const TerrainMaterial = ({ sandTexture, sandNormalMap, cliffTexture, cliffNormalMap }) => {
	const materialRef = useRef()

	// Configure textures for proper wrapping
	useMemo(() => {
		if (sandTexture) {
			sandTexture.wrapS = sandTexture.wrapT = RepeatWrapping
		}
		if (sandNormalMap) {
			sandNormalMap.wrapS = sandNormalMap.wrapT = RepeatWrapping
			sandNormalMap.repeat.set(0.35, 0.35)
		}
		if (cliffTexture) {
			cliffTexture.wrapS = cliffTexture.wrapT = RepeatWrapping
		}
		if (cliffNormalMap) {
			cliffNormalMap.wrapS = cliffNormalMap.wrapT = RepeatWrapping
		}
	}, [sandTexture, sandNormalMap, cliffTexture, cliffNormalMap])

	// Shader customization callback
	const onBeforeCompile = useMemo(() => {
		return (shader) => {
			// Add uniforms from config
			shader.uniforms.uTextureScale = { value: CLIFF_CONFIG.textureScale }
			shader.uniforms.uCliffTexture = { value: cliffTexture }
			shader.uniforms.uCliffNormalMap = { value: cliffNormalMap }
			// Blend parameters
			shader.uniforms.uHeightBlendStart = { value: CLIFF_CONFIG.heightBlendStart }
			shader.uniforms.uHeightBlendEnd = { value: CLIFF_CONFIG.heightBlendEnd }
			shader.uniforms.uHeightInfluence = { value: CLIFF_CONFIG.heightInfluence }
			shader.uniforms.uSlopeBlendStart = { value: CLIFF_CONFIG.slopeBlendStart }
			shader.uniforms.uSlopeBlendEnd = { value: CLIFF_CONFIG.slopeBlendEnd }
			shader.uniforms.uSlopeInfluence = { value: CLIFF_CONFIG.slopeInfluence }
			shader.uniforms.uCurvatureScale = { value: CLIFF_CONFIG.curvatureScale }
			shader.uniforms.uCurvatureSoftness = { value: CLIFF_CONFIG.curvatureSoftness }
			shader.uniforms.uRidgeInfluence = { value: CLIFF_CONFIG.ridgeInfluence }
			shader.uniforms.uValleyDarkening = { value: CLIFF_CONFIG.valleyDarkening }
			shader.uniforms.uLowAreaDarkening = { value: CLIFF_CONFIG.lowAreaDarkening } // Darker valley color

			// Vertex shader - pass world position
			shader.vertexShader = shader.vertexShader.replace(
				'#include <common>',
				`#include <common>
				varying vec3 vWorldPos;
				varying vec3 vWorldNormal;
				varying vec2 vCliffUV;`
			)

			shader.vertexShader = shader.vertexShader.replace(
				'#include <worldpos_vertex>',
				`#include <worldpos_vertex>
				vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
				vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
				vCliffUV = vWorldPos.xz * uTextureScale;`
			)

			// Add texture scale uniform to vertex shader for UV calculation
			shader.vertexShader = shader.vertexShader.replace(
				'void main() {',
				`uniform float uTextureScale;
				void main() {`
			)

			// Fragment shader - add terrain blending
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <common>',
				`#include <common>
				uniform float uTextureScale;
				uniform sampler2D uCliffTexture;
				uniform sampler2D uCliffNormalMap;
				uniform float uHeightBlendStart;
				uniform float uHeightBlendEnd;
				uniform float uHeightInfluence;
				uniform float uSlopeBlendStart;
				uniform float uSlopeBlendEnd;
				uniform float uSlopeInfluence;
				uniform float uCurvatureScale;
				uniform float uCurvatureSoftness;
				uniform float uRidgeInfluence;
				uniform float uValleyDarkening;
				uniform float uLowAreaDarkening;
				varying vec3 vWorldPos;
				varying vec3 vWorldNormal;
				varying vec2 vCliffUV;
				float cliffBlend;

				// Hash function for pseudo-random variation
				vec2 hash2(vec2 p) {
					return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
				}

				// Sample texture without tiling artifacts using stochastic sampling
				// Blends 4 neighboring tiles smoothly to avoid hard edges
				vec4 textureNoTile(sampler2D samp, vec2 uv) {
					// Tile scale - controls size of variation regions
					float tileScale = 0.25;
					vec2 scaledUV = uv * tileScale;

					// Get tile coordinates and fractional position within tile
					vec2 tile = floor(scaledUV);
					vec2 f = fract(scaledUV);

					// Smooth interpolation weights (hermite curve)
					vec2 w = f * f * (3.0 - 2.0 * f);

					// Compute derivatives for mip-mapping
					vec2 dx = dFdx(uv);
					vec2 dy = dFdy(uv);

					// Sample all 4 neighboring tiles with random offsets
					vec2 off00 = hash2(tile + vec2(0.0, 0.0));
					vec2 off10 = hash2(tile + vec2(1.0, 0.0));
					vec2 off01 = hash2(tile + vec2(0.0, 1.0));
					vec2 off11 = hash2(tile + vec2(1.0, 1.0));

					vec4 col00 = textureGrad(samp, uv + off00, dx, dy);
					vec4 col10 = textureGrad(samp, uv + off10, dx, dy);
					vec4 col01 = textureGrad(samp, uv + off01, dx, dy);
					vec4 col11 = textureGrad(samp, uv + off11, dx, dy);

					// Bilinear blend between the 4 tiles
					vec4 colX0 = mix(col00, col10, w.x);
					vec4 colX1 = mix(col01, col11, w.x);
					return mix(colX0, colX1, w.y);
				}

				// Calculate approximate curvature from world position derivatives
				float getCurvature() {
					vec3 dx = dFdx(vWorldPos);
					vec3 dy = dFdy(vWorldPos);
					vec3 ddx = dFdx(vWorldNormal);
					vec3 ddy = dFdy(vWorldNormal);

					// Mean curvature approximation
					float curvature = (dot(ddx, dx) + dot(ddy, dy)) * 0.5;
					return curvature;
				}`
			)

			// Modify diffuse color after it's set
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <map_fragment>',
				`#include <map_fragment>

				// Sample cliff texture using world position UV with anti-tiling
				vec2 cliffUV = vWorldPos.xz * uTextureScale;
				vec4 cliffColor = textureNoTile(uCliffTexture, cliffUV);

				// Height factor (0 = low, 1 = high) using absolute world heights
				float heightFactor = smoothstep(uHeightBlendStart, uHeightBlendEnd, vWorldPos.y);

				// Slope factor (0 = flat, 1 = steep cliff)
				float slopeFactor = 1.0 - abs(vWorldNormal.y);
				slopeFactor = smoothstep(uSlopeBlendStart, uSlopeBlendEnd, slopeFactor);

				// Curvature for erosion patterns
				float curvature = getCurvature();

				// Positive curvature = convex (ridges), negative = concave (valleys)
				float ridgeFactor = clamp(curvature * uCurvatureScale, 0.0, 1.0);
				ridgeFactor = ridgeFactor / (uCurvatureSoftness + ridgeFactor);

				float valleyFactor = clamp(-curvature * uCurvatureScale, 0.0, 1.0);
				valleyFactor = valleyFactor / (uCurvatureSoftness + valleyFactor);

				// Blend factors for cliff texture
				// Cliff appears on: steep slopes, high areas, ridges
				cliffBlend = max(slopeFactor * uSlopeInfluence, heightFactor * uHeightInfluence);
				cliffBlend = max(cliffBlend, ridgeFactor * uRidgeInfluence);
				cliffBlend = clamp(cliffBlend, 0.0, 1.0);

				// Valley darkening in concave areas and low spots
				float valleyBlend = valleyFactor * uValleyDarkening + (1.0 - heightFactor) * uLowAreaDarkening;
				valleyBlend = clamp(valleyBlend, 0.0, uValleyDarkening);

				// Blend sand and cliff textures
				vec3 blendedColor = mix(diffuseColor.rgb, cliffColor.rgb, cliffBlend);

				// Darken valleys and low areas
				blendedColor *= (1.0 - valleyBlend);

				diffuseColor.rgb = blendedColor;`
			)

			// Replace normal map fragment to blend both normal maps
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <normal_fragment_maps>',
				`#ifdef USE_NORMALMAP
					// Sample sand normal from the standard normal map
					vec3 sandNormal = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;

					// Sample cliff normal using world-space UVs with anti-tiling
					vec3 cliffNormal = textureNoTile(uCliffNormalMap, vCliffUV).xyz * 2.0 - 1.0;

					// Blend normals based on terrain blend factor
					vec3 mapN = mix(sandNormal, cliffNormal, cliffBlend);
					mapN.xy *= normalScale;

					normal = normalize(tbn * mapN);
				#endif`
			)
		}
	}, [cliffTexture, cliffNormalMap])

	return <meshStandardMaterial ref={materialRef} map={sandTexture} normalMap={sandNormalMap} onBeforeCompile={onBeforeCompile} />
}

export default TerrainMaterial
