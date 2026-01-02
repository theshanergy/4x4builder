// Custom terrain shader material extending MeshStandardMaterial
// Adds height/slope/curvature-based color blending while preserving standard PBR lighting

import { useMemo, useRef } from 'react'
import { RepeatWrapping } from 'three'

/**
 * Terrain Layer Configuration
 *
 * Each layer defines:
 * - name: Layer identifier
 * - textures: Paths to albedo and normal textures
 * - textureScale: World-space texture tiling scale
 * - blend: Blending configuration (not needed for base layer)
 *   - type: 'height', 'slope', or 'height_slope' (combined)
 *   - height: { start, end, influence } - Height-based blending
 *   - slope: { start, end, influence } - Slope-based blending (0=flat, 1=steep)
 *   - curvature: { scale, softness, ridgeInfluence } - Curvature-based erosion
 *   - invert: If true, layer appears where conditions are NOT met
 *
 * Layers are rendered bottom-to-top (first layer is base)
 */
export const TERRAIN_LAYERS = [
	{
		name: 'rock',
		textures: {
			albedo: '/assets/images/ground/slatecliffrock_albedo.jpg',
			normal: '/assets/images/ground/slatecliffrock_normal.jpg',
		},
		textureScale: 0.015,
		// Base layer - no blend config needed
		// Uses triplanar projection with LOD and stochastic sampling
		triplanar: true,
		lod: {
			distanceScaleStart: 100,
			distanceScaleFactor: 300,
			levels: 3,
		},
	},
	{
		name: 'sand',
		textures: {
			albedo: '/assets/images/ground/sand.jpg',
			normal: '/assets/images/ground/sand_normal.jpg',
		},
		// Use built-in mesh UVs (sampled via Three.js map_fragment)
		useBuiltinUV: true,
		normalScale: 0.35,
		blend: {
			type: 'height_slope',
			height: {
				start: 4, // Height where sand starts fading out
				end: 60, // Height where sand is fully gone
				influence: 0.8,
			},
			slope: {
				start: 0.1, // Slope threshold where sand starts fading
				end: 0.3, // Slope threshold where sand is fully gone
				influence: 0.9,
			},
			curvature: {
				scale: 50.0,
				softness: 0.3,
				ridgeInfluence: 0.5,
			},
		},
	},
	{
		name: 'snow',
		textures: {
			albedo: '/assets/images/ground/snow.jpg',
			normal: '/assets/images/ground/snow_normal.jpg',
		},
		textureScale: 0.05,
		normalScale: 0.5,
		blend: {
			type: 'height_slope',
			height: {
				start: 80, // Height where snow starts appearing
				end: 120, // Height where snow is fully present
				influence: 1.0,
			},
			slope: {
				start: 0.5, // Snow fades on slopes steeper than this
				end: 0.8, // Snow fully gone on very steep slopes
				influence: 0.7,
				invert: true, // Snow appears on flat areas, not steep
			},
		},
	},
]

// Generate shader uniforms from layer config
const generateLayerUniforms = (layers) => {
	const uniforms = {}

	layers.forEach((layer, index) => {
		const prefix = `uLayer${index}`

		uniforms[`${prefix}TextureScale`] = layer.textureScale

		if (layer.lod) {
			uniforms[`${prefix}DistanceScaleStart`] = layer.lod.distanceScaleStart
			uniforms[`${prefix}DistanceScaleFactor`] = layer.lod.distanceScaleFactor
			uniforms[`${prefix}LODLevels`] = layer.lod.levels
		}

		if (layer.normalScale !== undefined) {
			uniforms[`${prefix}NormalScale`] = layer.normalScale
		}

		if (layer.blend) {
			if (layer.blend.height) {
				uniforms[`${prefix}HeightStart`] = layer.blend.height.start
				uniforms[`${prefix}HeightEnd`] = layer.blend.height.end
				uniforms[`${prefix}HeightInfluence`] = layer.blend.height.influence
			}
			if (layer.blend.slope) {
				uniforms[`${prefix}SlopeStart`] = layer.blend.slope.start
				uniforms[`${prefix}SlopeEnd`] = layer.blend.slope.end
				uniforms[`${prefix}SlopeInfluence`] = layer.blend.slope.influence
				uniforms[`${prefix}SlopeInvert`] = layer.blend.slope.invert ? 1.0 : 0.0
			}
			if (layer.blend.curvature) {
				uniforms[`${prefix}CurvatureScale`] = layer.blend.curvature.scale
				uniforms[`${prefix}CurvatureSoftness`] = layer.blend.curvature.softness
				uniforms[`${prefix}RidgeInfluence`] = layer.blend.curvature.ridgeInfluence
			}
		}
	})

	return uniforms
}

// Generate uniform declarations for fragment shader
const generateUniformDeclarations = (layers) => {
	let declarations = ''

	layers.forEach((layer, index) => {
		const prefix = `uLayer${index}`

		declarations += `uniform sampler2D ${prefix}Texture;\n`
		declarations += `uniform sampler2D ${prefix}NormalMap;\n`
		declarations += `uniform float ${prefix}TextureScale;\n`

		if (layer.lod) {
			declarations += `uniform float ${prefix}DistanceScaleStart;\n`
			declarations += `uniform float ${prefix}DistanceScaleFactor;\n`
			declarations += `uniform float ${prefix}LODLevels;\n`
		}

		if (layer.normalScale !== undefined) {
			declarations += `uniform float ${prefix}NormalScale;\n`
		}

		if (layer.blend) {
			if (layer.blend.height) {
				declarations += `uniform float ${prefix}HeightStart;\n`
				declarations += `uniform float ${prefix}HeightEnd;\n`
				declarations += `uniform float ${prefix}HeightInfluence;\n`
			}
			if (layer.blend.slope) {
				declarations += `uniform float ${prefix}SlopeStart;\n`
				declarations += `uniform float ${prefix}SlopeEnd;\n`
				declarations += `uniform float ${prefix}SlopeInfluence;\n`
				declarations += `uniform float ${prefix}SlopeInvert;\n`
			}
			if (layer.blend.curvature) {
				declarations += `uniform float ${prefix}CurvatureScale;\n`
				declarations += `uniform float ${prefix}CurvatureSoftness;\n`
				declarations += `uniform float ${prefix}RidgeInfluence;\n`
			}
		}
	})

	return declarations
}

// Generate blend factor calculation for a layer
const generateBlendCode = (layer, index) => {
	if (!layer.blend) return ''

	const prefix = `uLayer${index}`
	let code = `
	// Layer ${index} (${layer.name}) blend calculation
	float layer${index}Blend = 0.0;
	{`

	if (layer.blend.type === 'height_slope' || layer.blend.type === 'height') {
		if (layer.blend.height) {
			code += `
		// Height factor
		float heightFactor${index} = smoothstep(${prefix}HeightStart, ${prefix}HeightEnd, vWorldPos.y);`

			// For snow-like layers that appear at height (not fade out)
			if (layer.blend.height.start < layer.blend.height.end && index > 1) {
				code += `
		// Layer appears at height (not fading out)`
			} else {
				code += `
		heightFactor${index} = 1.0 - heightFactor${index}; // Invert: visible at low heights`
			}
		}
	}

	if (layer.blend.type === 'height_slope' || layer.blend.type === 'slope') {
		if (layer.blend.slope) {
			code += `
		// Slope factor (0 = flat, 1 = steep)
		float slopeFactor${index} = 1.0 - abs(vWorldNormal.y);
		slopeFactor${index} = smoothstep(${prefix}SlopeStart, ${prefix}SlopeEnd, slopeFactor${index});
		// Apply invert if needed (for layers that appear on flat areas)
		slopeFactor${index} = mix(slopeFactor${index}, 1.0 - slopeFactor${index}, ${prefix}SlopeInvert);`
		}
	}

	if (layer.blend.curvature) {
		code += `
		// Curvature for erosion patterns
		float ridgeFactor${index} = clamp(curvature * ${prefix}CurvatureScale, 0.0, 1.0);
		ridgeFactor${index} = ridgeFactor${index} / (${prefix}CurvatureSoftness + ridgeFactor${index});`
	}

	// Combine factors based on blend type
	if (layer.blend.type === 'height_slope') {
		if (layer.blend.height && layer.blend.slope) {
			// For layers that appear at conditions (like snow at high + flat)
			if (layer.blend.height.start < layer.blend.height.end && index > 1) {
				code += `
		// Combine: layer visible where height AND slope conditions are met
		layer${index}Blend = heightFactor${index} * ${prefix}HeightInfluence;
		layer${index}Blend *= (1.0 - slopeFactor${index} * ${prefix}SlopeInfluence);`
			} else {
				// For layers that fade at conditions (like sand fading at high/steep)
				code += `
		// Rock visibility (inverse = this layer visibility)
		float rockBlend${index} = max(slopeFactor${index} * ${prefix}SlopeInfluence, (1.0 - heightFactor${index}) * ${prefix}HeightInfluence);`

				if (layer.blend.curvature) {
					code += `
		rockBlend${index} = max(rockBlend${index}, ridgeFactor${index} * ${prefix}RidgeInfluence);`
				}

				code += `
		rockBlend${index} = clamp(rockBlend${index}, 0.0, 1.0);
		layer${index}Blend = 1.0 - rockBlend${index};

		// Mask out above height end
		float heightMask${index} = 1.0 - smoothstep(${prefix}HeightStart, ${prefix}HeightEnd + 2.0, vWorldPos.y);
		layer${index}Blend *= heightMask${index};`
			}
		}
	} else if (layer.blend.type === 'height') {
		code += `
		layer${index}Blend = heightFactor${index} * ${prefix}HeightInfluence;`
	} else if (layer.blend.type === 'slope') {
		code += `
		layer${index}Blend = (1.0 - slopeFactor${index}) * ${prefix}SlopeInfluence;`
	}

	code += `
	}
	layer${index}Blend = clamp(layer${index}Blend, 0.0, 1.0);`

	return code
}

// Generate color sampling code for a layer
const generateSamplingCode = (layer, index) => {
	const prefix = `uLayer${index}`

	if (layer.triplanar && layer.lod) {
		return `
	// Layer ${index} (${layer.name}) - triplanar with LOD
	vec3 lodInfo${index} = getDistanceLODBlend(vWorldPos, ${prefix}DistanceScaleStart, ${prefix}DistanceScaleFactor, ${prefix}LODLevels);
	vec4 layer${index}Color = textureTriplanarLOD(${prefix}Texture, vWorldPos, vWorldNormal, ${prefix}TextureScale, lodInfo${index});
	vec3 layer${index}Normal = normalTriplanarLOD(${prefix}NormalMap, vWorldPos, vWorldNormal, ${prefix}TextureScale, lodInfo${index});`
	} else if (layer.triplanar) {
		return `
	// Layer ${index} (${layer.name}) - triplanar
	vec4 layer${index}Color = textureTriplanar(${prefix}Texture, vWorldPos, vWorldNormal, ${prefix}TextureScale);
	vec3 layer${index}Normal = normalTriplanar(${prefix}NormalMap, vWorldPos, vWorldNormal, ${prefix}TextureScale);`
	} else if (layer.useBuiltinUV) {
		// Use Three.js built-in UV sampling (already done in map_fragment for diffuseColor)
		return `
	// Layer ${index} (${layer.name}) - uses built-in mesh UVs (from diffuseColor/normalMap)
	vec4 layer${index}Color = diffuseColor;
	vec3 layer${index}NormalSample = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
	layer${index}NormalSample.xy *= ${layer.normalScale !== undefined ? `${prefix}NormalScale` : '1.0'};
	// Convert tangent-space normal to world-space using UDN blending for Y-up projection
	vec3 layer${index}Normal = normalize(vec3(
		layer${index}NormalSample.x + vWorldNormal.x,
		abs(layer${index}NormalSample.z) * vWorldNormal.y,
		layer${index}NormalSample.y + vWorldNormal.z
	));`
	} else {
		return `
	// Layer ${index} (${layer.name}) - world-space UV mapping with stochastic sampling
	vec2 layer${index}UV = vWorldPos.xz * ${prefix}TextureScale;
	vec4 layer${index}Color = textureNoTile(${prefix}Texture, layer${index}UV);
	vec3 layer${index}NormalSample = textureNoTile(${prefix}NormalMap, layer${index}UV).xyz * 2.0 - 1.0;
	layer${index}NormalSample.xy *= ${layer.normalScale !== undefined ? `${prefix}NormalScale` : '1.0'};
	// Convert tangent-space normal to world-space using UDN blending for Y-up projection
	vec3 layer${index}Normal = normalize(vec3(
		layer${index}NormalSample.x + vWorldNormal.x,
		abs(layer${index}NormalSample.z) * vWorldNormal.y,
		layer${index}NormalSample.y + vWorldNormal.z
	));`
	}
}

// Generate the final color blending code
const generateColorBlendingCode = (layers) => {
	let code = `
	// Start with base layer (layer 0)
	vec3 finalColor = layer0Color.rgb;
	vec3 finalNormal = layer0Normal;
	`

	// Blend each subsequent layer on top
	for (let i = 1; i < layers.length; i++) {
		code += `
	// Blend layer ${i} (${layers[i].name})
	finalColor = mix(finalColor, layer${i}Color.rgb, layer${i}Blend);
	finalNormal = normalize(mix(finalNormal, layer${i}Normal, layer${i}Blend));`
	}

	code += `

	diffuseColor.rgb = finalColor;`

	return code
}

// Generate normal blending code
const generateNormalBlendingCode = (layers) => {
	let code = `
	// Start with base layer normal
	vec3 blendedNormal = layer0Normal;`

	for (let i = 1; i < layers.length; i++) {
		code += `
	blendedNormal = normalize(mix(blendedNormal, layer${i}Normal, layer${i}Blend));`
	}

	code += `
	normal = blendedNormal;`

	return code
}

/**
 * TerrainMaterial - Extends MeshStandardMaterial with procedural terrain blending
 *
 * Features:
 * - Preserves standard PBR lighting (identical to meshStandardMaterial)
 * - Config-driven layer system with arbitrary texture layers
 * - Height-based, slope-based, and curvature-based blending
 * - Triplanar projection and stochastic sampling for base layer
 */
const TerrainMaterial = ({ layerTextures }) => {
	const materialRef = useRef()

	// Configure textures for proper wrapping
	useMemo(() => {
		Object.values(layerTextures).forEach((textures) => {
			if (textures.albedo) {
				textures.albedo.wrapS = textures.albedo.wrapT = RepeatWrapping
			}
			if (textures.normal) {
				textures.normal.wrapS = textures.normal.wrapT = RepeatWrapping
			}
		})
	}, [layerTextures])

	// Pre-generate shader code from config
	const shaderCode = useMemo(() => {
		const uniformDeclarations = generateUniformDeclarations(TERRAIN_LAYERS)
		const blendCalculations = TERRAIN_LAYERS.map((layer, i) => generateBlendCode(layer, i)).join('\n')
		const samplingCode = TERRAIN_LAYERS.map((layer, i) => generateSamplingCode(layer, i)).join('\n')
		const colorBlending = generateColorBlendingCode(TERRAIN_LAYERS)
		const normalBlending = generateNormalBlendingCode(TERRAIN_LAYERS)

		return { uniformDeclarations, blendCalculations, samplingCode, colorBlending, normalBlending }
	}, [])

	// Shader customization callback
	const onBeforeCompile = useMemo(() => {
		return (shader) => {
			// Set texture uniforms
			TERRAIN_LAYERS.forEach((layer, index) => {
				const prefix = `uLayer${index}`
				const textures = layerTextures[layer.name]
				if (textures) {
					shader.uniforms[`${prefix}Texture`] = { value: textures.albedo }
					shader.uniforms[`${prefix}NormalMap`] = { value: textures.normal }
				}
			})

			// Set parameter uniforms from config
			const paramUniforms = generateLayerUniforms(TERRAIN_LAYERS)
			Object.entries(paramUniforms).forEach(([key, value]) => {
				shader.uniforms[key] = { value }
			})

			// Vertex shader - pass world position
			shader.vertexShader = shader.vertexShader.replace(
				'#include <common>',
				`#include <common>
				varying vec3 vWorldPos;
				varying vec3 vWorldNormal;`
			)

			shader.vertexShader = shader.vertexShader.replace(
				'#include <worldpos_vertex>',
				`#include <worldpos_vertex>
				vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
				vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
			)

			// Fragment shader - add terrain blending
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <common>',
				`#include <common>
				// Layer uniforms (generated from config)
				${shaderCode.uniformDeclarations}
				// Varyings
				varying vec3 vWorldPos;
				varying vec3 vWorldNormal;

				// Blend factors for each layer
				${TERRAIN_LAYERS.map((_, i) => `float layer${i}Blend;`).join('\n				')}

				// Hash function for pseudo-random variation
				vec2 hash2(vec2 p) {
					return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
				}

				// Sample texture - uses stochastic sampling nearby, plain sampling at distance
				vec4 textureNoTile(sampler2D samp, vec2 uv) {
					// Compute derivatives for mip-mapping
					vec2 dx = dFdx(uv);
					vec2 dy = dFdy(uv);

					// Fade out stochastic sampling at distance to avoid seams on large LOD tiles
					float dist = length(vWorldPos - cameraPosition);
					float stochasticBlend = 1.0 - smoothstep(150.0, 400.0, dist);

					// Early out for distant terrain - just use plain sampling
					if (stochasticBlend < 0.01) {
						return textureGrad(samp, uv, dx, dy);
					}

					// Stochastic sampling for nearby terrain
					float tileScale = 0.08;
					vec2 scaledUV = uv * tileScale;
					vec2 tile = floor(scaledUV);
					vec2 f = fract(scaledUV);

					// Use diagonal blend (2 samples instead of 4)
					float w = smoothstep(0.0, 1.0, f.x + f.y - 0.5);

					vec2 off0 = hash2(tile);
					vec2 off1 = hash2(tile + vec2(1.0, 1.0));

					vec4 col0 = textureGrad(samp, uv + off0, dx, dy);
					vec4 col1 = textureGrad(samp, uv + off1, dx, dy);
					vec4 stochasticColor = mix(col0, col1, w);

					// Blend between stochastic (near) and plain (far) sampling
					vec4 plainColor = textureGrad(samp, uv, dx, dy);
					return mix(plainColor, stochasticColor, stochasticBlend);
				}

				// Calculate LOD blend info - returns vec3(lowerScale, upperScale, blendFactor)
				vec3 getDistanceLODBlend(vec3 worldPos, float distanceStart, float distanceFactor, float lodLevels) {
					float dist = length(worldPos - cameraPosition);
					// Calculate continuous LOD level
					float lodContinuous = (dist - distanceStart) / distanceFactor;
					lodContinuous = clamp(lodContinuous, 0.0, lodLevels - 1.0);

					// Get lower and upper LOD levels
					float lodLower = floor(lodContinuous);
					float lodUpper = min(lodLower + 1.0, lodLevels - 1.0);

					// Blend factor between levels (0 = fully lower, 1 = fully upper)
					float blend = fract(lodContinuous);
					// Apply smoothstep for smoother transition
					blend = smoothstep(0.0, 1.0, blend);

					// Return scales for both LODs and blend factor
					return vec3(pow(2.0, lodLower), pow(2.0, lodUpper), blend);
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
				}

				// Triplanar texture sampling - projects texture from 3 axes and blends based on normal
				vec4 textureTriplanar(sampler2D samp, vec3 worldPos, vec3 worldNormal, float scale) {
					// Calculate blend weights from world normal (sharper falloff for cleaner transitions)
					vec3 blend = abs(worldNormal);
					blend = pow(blend, vec3(4.0));
					blend /= (blend.x + blend.y + blend.z);

					// Calculate UVs for each axis projection
					vec2 uvX = worldPos.zy * scale;
					vec2 uvY = worldPos.xz * scale;
					vec2 uvZ = worldPos.xy * scale;

					// Sample from each projection with anti-tiling
					vec4 colX = textureNoTile(samp, uvX);
					vec4 colY = textureNoTile(samp, uvY);
					vec4 colZ = textureNoTile(samp, uvZ);

					// Blend based on normal direction
					return colX * blend.x + colY * blend.y + colZ * blend.z;
				}

				// Triplanar with LOD blending - samples at two scales and blends between them
				vec4 textureTriplanarLOD(sampler2D samp, vec3 worldPos, vec3 worldNormal, float baseScale, vec3 lodInfo) {
					float scaleLower = baseScale / lodInfo.x;
					float scaleUpper = baseScale / lodInfo.y;
					float lodBlend = lodInfo.z;

					// Sample at both LOD scales
					vec4 colorLower = textureTriplanar(samp, worldPos, worldNormal, scaleLower);
					vec4 colorUpper = textureTriplanar(samp, worldPos, worldNormal, scaleUpper);

					// Blend between LOD levels
					return mix(colorLower, colorUpper, lodBlend);
				}

				// Triplanar normal sampling with proper tangent space blending (UDN method)
				vec3 normalTriplanar(sampler2D samp, vec3 worldPos, vec3 worldNormal, float scale) {
					// Calculate blend weights from world normal
					vec3 blend = abs(worldNormal);
					blend = pow(blend, vec3(4.0));
					blend /= (blend.x + blend.y + blend.z);

					// Calculate UVs for each axis projection
					vec2 uvX = worldPos.zy * scale;
					vec2 uvY = worldPos.xz * scale;
					vec2 uvZ = worldPos.xy * scale;

					// Sample normals from each projection with anti-tiling
					vec3 tnormX = textureNoTile(samp, uvX).xyz * 2.0 - 1.0;
					vec3 tnormY = textureNoTile(samp, uvY).xyz * 2.0 - 1.0;
					vec3 tnormZ = textureNoTile(samp, uvZ).xyz * 2.0 - 1.0;

					// Swizzle world normals into tangent space for each axis and apply UDN blend
					// This properly handles the orientation of each projection plane
					vec3 normalX = vec3(tnormX.xy + worldNormal.zy, abs(tnormX.z) * worldNormal.x);
					vec3 normalY = vec3(tnormY.xy + worldNormal.xz, abs(tnormY.z) * worldNormal.y);
					vec3 normalZ = vec3(tnormZ.xy + worldNormal.xy, abs(tnormZ.z) * worldNormal.z);

					// Swizzle back to world space and blend
					vec3 result = normalize(
						normalX.zxy * blend.x +
						normalY.xzy * blend.y +
						normalZ.xyz * blend.z
					);

					return result;
				}

				// Triplanar normal with LOD blending
				vec3 normalTriplanarLOD(sampler2D samp, vec3 worldPos, vec3 worldNormal, float baseScale, vec3 lodInfo) {
					float scaleLower = baseScale / lodInfo.x;
					float scaleUpper = baseScale / lodInfo.y;
					float lodBlend = lodInfo.z;

					// Sample normals at both LOD scales
					vec3 normalLower = normalTriplanar(samp, worldPos, worldNormal, scaleLower);
					vec3 normalUpper = normalTriplanar(samp, worldPos, worldNormal, scaleUpper);

					// Blend between LOD levels
					return normalize(mix(normalLower, normalUpper, lodBlend));
				}

`
			)

			// Modify diffuse color after it's set
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <map_fragment>',
				`#include <map_fragment>

				// Calculate curvature once for all layers
				float curvature = getCurvature();

				// Sample all layer textures
				${shaderCode.samplingCode}

				// Calculate blend factors for each layer
				layer0Blend = 1.0; // Base layer always fully visible initially
				${shaderCode.blendCalculations}

				// Blend colors from all layers
				${shaderCode.colorBlending}`
			)

			// Replace normal map fragment to blend all layer normals
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <normal_fragment_maps>',
				`#ifdef USE_NORMALMAP
					${shaderCode.normalBlending}
				#endif`
			)
		}
	}, [layerTextures, shaderCode])

	// Find the layer that uses built-in UVs - this will be passed to the material's map/normalMap
	const builtinUVLayer = TERRAIN_LAYERS.find((layer) => layer.useBuiltinUV)
	const builtinTextures = builtinUVLayer ? layerTextures[builtinUVLayer.name] : null

	// Apply normal scale via repeat (as original code did)
	useMemo(() => {
		if (builtinTextures?.normal && builtinUVLayer?.normalScale) {
			builtinTextures.normal.repeat.set(builtinUVLayer.normalScale, builtinUVLayer.normalScale)
		}
	}, [builtinTextures, builtinUVLayer])

	return <meshStandardMaterial ref={materialRef} map={builtinTextures?.albedo} normalMap={builtinTextures?.normal} onBeforeCompile={onBeforeCompile} />
}

export default TerrainMaterial
