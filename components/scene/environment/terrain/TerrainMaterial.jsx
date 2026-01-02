import { useMemo, useRef } from 'react'
import { RepeatWrapping } from 'three'
import { TERRAIN_LAYERS } from '../../../../config/terrain'

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
		slopeFactor${index} = smoothstep(${prefix}SlopeStart, ${prefix}SlopeEnd, slopeFactor${index});`
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
	// For non-base layers, wrap sampling in a conditional to skip when blend is near zero
	const isBaseLayer = index === 0

	if (layer.triplanar && layer.lod) {
		const useNoTile = layer.stochastic ? 'true' : 'false'
		const sampling = `
	// Layer ${index} (${layer.name}) - triplanar with LOD
	vec4 layer${index}Color = vec4(0.0);
	vec3 layer${index}Normal = vWorldNormal;${
			isBaseLayer
				? ''
				: `
	if (layer${index}Blend > 0.01) {`
		}
		vec3 lodInfo${index} = getDistanceLODBlend(vWorldPos, ${prefix}DistanceScaleStart, ${prefix}DistanceScaleFactor, ${prefix}LODLevels);
		layer${index}Color = textureTriplanarLOD(${prefix}Texture, vWorldPos, vWorldNormal, ${prefix}TextureScale, lodInfo${index}, true, ${useNoTile});
		layer${index}Normal = normalTriplanarLOD(${prefix}NormalMap, vWorldPos, vWorldNormal, ${prefix}TextureScale, lodInfo${index}, ${useNoTile});${
			isBaseLayer
				? ''
				: `
	}`
		}`
		return sampling
	} else if (layer.triplanar) {
		const useNoTile = layer.stochastic ? 'true' : 'false'
		const sampling = `
	// Layer ${index} (${layer.name}) - triplanar
	vec4 layer${index}Color = vec4(0.0);
	vec3 layer${index}Normal = vWorldNormal;${
			isBaseLayer
				? ''
				: `
	if (layer${index}Blend > 0.01) {`
		}
		layer${index}Color = textureTriplanar(${prefix}Texture, vWorldPos, vWorldNormal, ${prefix}TextureScale, true, ${useNoTile});
		layer${index}Normal = normalTriplanar(${prefix}NormalMap, vWorldPos, vWorldNormal, ${prefix}TextureScale, ${useNoTile});${
			isBaseLayer
				? ''
				: `
	}`
		}`
		return sampling
	} else if (layer.lod) {
		// Non-triplanar layer with LOD
		const sampling = `
	// Layer ${index} (${layer.name}) - world-space UV mapping with LOD
	vec4 layer${index}Color = vec4(0.0);
	vec3 layer${index}Normal = vWorldNormal;${
			isBaseLayer
				? ''
				: `
	if (layer${index}Blend > 0.01) {`
		}
		vec3 lodInfo${index} = getDistanceLODBlend(vWorldPos, ${prefix}DistanceScaleStart, ${prefix}DistanceScaleFactor, ${prefix}LODLevels);
		float scaleLower${index} = ${prefix}TextureScale / lodInfo${index}.x;
		float scaleUpper${index} = ${prefix}TextureScale / lodInfo${index}.y;
		float lodBlend${index} = lodInfo${index}.z;
		
		vec2 uvLower${index} = vWorldPos.xz * scaleLower${index};
		vec2 uvUpper${index} = vWorldPos.xz * scaleUpper${index};
		
		vec4 colorLower${index} = textureNoTile(${prefix}Texture, uvLower${index}, true);
		vec4 colorUpper${index} = textureNoTile(${prefix}Texture, uvUpper${index}, true);
		layer${index}Color = mix(colorLower${index}, colorUpper${index}, lodBlend${index});
		
		vec3 normalLower${index} = textureNoTile(${prefix}NormalMap, uvLower${index}).xyz * 2.0 - 1.0;
		vec3 normalUpper${index} = textureNoTile(${prefix}NormalMap, uvUpper${index}).xyz * 2.0 - 1.0;
		vec3 normalSample${index} = mix(normalLower${index}, normalUpper${index}, lodBlend${index});
		normalSample${index}.xy *= ${layer.normalScale !== undefined ? `${prefix}NormalScale` : '1.0'};
		// Convert tangent-space normal to world-space using UDN blending for Y-up projection
		layer${index}Normal = normalize(vec3(
			normalSample${index}.x + vWorldNormal.x,
			abs(normalSample${index}.z) * vWorldNormal.y,
			normalSample${index}.y + vWorldNormal.z
		));${
			isBaseLayer
				? ''
				: `
	}`
		}`
		return sampling
	} else {
		// Non-triplanar layers without LOD (sand, snow) with stochastic sampling
		const sampling = `
	// Layer ${index} (${layer.name}) - world-space UV mapping with stochastic sampling
	vec4 layer${index}Color = vec4(0.0);
	vec3 layer${index}Normal = vWorldNormal;${
			isBaseLayer
				? ''
				: `
	if (layer${index}Blend > 0.01) {`
		}
		vec2 layer${index}UV = vWorldPos.xz * ${prefix}TextureScale;
		layer${index}Color = textureNoTile(${prefix}Texture, layer${index}UV, true);
		vec3 layer${index}NormalSample = textureNoTile(${prefix}NormalMap, layer${index}UV).xyz * 2.0 - 1.0;
		layer${index}NormalSample.xy *= ${layer.normalScale !== undefined ? `${prefix}NormalScale` : '1.0'};
		// Convert tangent-space normal to world-space using UDN blending for Y-up projection
		layer${index}Normal = normalize(vec3(
			layer${index}NormalSample.x + vWorldNormal.x,
			abs(layer${index}NormalSample.z) * vWorldNormal.y,
			layer${index}NormalSample.y + vWorldNormal.z
		));${
			isBaseLayer
				? ''
				: `
	}`
		}`
		return sampling
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

				// sRGB to linear color space conversion
				vec3 sRGBToLinear(vec3 srgb) {
					return pow(srgb, vec3(2.2));
				}

				vec4 sRGBToLinear(vec4 srgb) {
					return vec4(pow(srgb.rgb, vec3(2.2)), srgb.a);
				}

				// Hash function for pseudo-random variation
				vec2 hash2(vec2 p) {
					return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
				}

				// Sample texture - uses stochastic sampling nearby, plain sampling at distance
				// Set srgb=true for albedo textures to convert to linear space
				// Accepts pre-computed derivatives for efficiency
				vec4 textureNoTileWithDerivs(sampler2D samp, vec2 uv, vec2 dx, vec2 dy, float stochasticBlend, bool srgb) {
					vec4 result;

					// Early out for distant terrain - just use plain sampling
					if (stochasticBlend < 0.01) {
						result = textureGrad(samp, uv, dx, dy);
					} else {
						// Stochastic sampling for nearby terrain
						float tileScale = 0.08;
						vec2 scaledUV = uv * tileScale;
						vec2 tile = floor(scaledUV);
						vec2 f = fract(scaledUV);

						// Use integer offsets to preserve seamless tiling
						vec2 rand0 = hash2(tile);
						vec2 off0 = floor(rand0 * 16.0);

						vec4 stochasticColor;

						// At medium distance (0.3-0.7 blend), use single sample for performance
						// At close distance (>0.7 blend), use 2-sample diagonal blend for quality
						if (stochasticBlend > 0.7) {
							// Full quality: 2-sample diagonal blend
							float w = smoothstep(0.0, 1.0, f.x + f.y - 0.5);
							vec2 rand1 = hash2(tile + vec2(1.0, 1.0));
							vec2 off1 = floor(rand1 * 16.0);
							vec4 col0 = textureGrad(samp, uv + off0, dx, dy);
							vec4 col1 = textureGrad(samp, uv + off1, dx, dy);
							stochasticColor = mix(col0, col1, w);
						} else {
							// Medium distance: single offset sample
							stochasticColor = textureGrad(samp, uv + off0, dx, dy);
						}

						// Blend between stochastic (near) and plain (far) sampling
						vec4 plainColor = textureGrad(samp, uv, dx, dy);
						result = mix(plainColor, stochasticColor, stochasticBlend);
					}

					// Convert sRGB to linear color space for albedo textures
					return srgb ? sRGBToLinear(result) : result;
				}

				// Wrapper that computes derivatives and distance blend
				vec4 textureNoTile(sampler2D samp, vec2 uv, bool srgb) {
					vec2 dx = dFdx(uv);
					vec2 dy = dFdy(uv);
					float dist = length(vWorldPos - cameraPosition);
					float stochasticBlend = 1.0 - smoothstep(150.0, 400.0, dist);
					return textureNoTileWithDerivs(samp, uv, dx, dy, stochasticBlend, srgb);
				}

				// Convenience overload for normal maps (no sRGB conversion)
				vec4 textureNoTile(sampler2D samp, vec2 uv) {
					return textureNoTile(samp, uv, false);
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
				// Set srgb=true for albedo textures to convert to linear space
				// Set useNoTile=true to enable stochastic anti-tiling (more expensive)
				// stochasticBlend controls the intensity of stochastic sampling (0=off, 1=full)
				vec4 textureTriplanarWithBlend(sampler2D samp, vec3 worldPos, vec3 worldNormal, float scale, bool srgb, float stochasticBlend) {
					// Calculate blend weights from world normal (sharper falloff for cleaner transitions)
					vec3 blend = abs(worldNormal);
					blend = pow(blend, vec3(4.0));
					blend /= (blend.x + blend.y + blend.z);

					// Calculate UVs for each axis projection
					vec2 uvX = worldPos.zy * scale;
					vec2 uvY = worldPos.xz * scale;
					vec2 uvZ = worldPos.xy * scale;

					// Pre-compute derivatives once for all projections
					vec2 dxX = dFdx(uvX);
					vec2 dyX = dFdy(uvX);
					vec2 dxY = dFdx(uvY);
					vec2 dyY = dFdy(uvY);
					vec2 dxZ = dFdx(uvZ);
					vec2 dyZ = dFdy(uvZ);

					// Sample from each projection
					vec4 colX, colY, colZ;
					if (stochasticBlend > 0.01) {
						colX = textureNoTileWithDerivs(samp, uvX, dxX, dyX, stochasticBlend, srgb);
						colY = textureNoTileWithDerivs(samp, uvY, dxY, dyY, stochasticBlend, srgb);
						colZ = textureNoTileWithDerivs(samp, uvZ, dxZ, dyZ, stochasticBlend, srgb);
					} else {
						colX = textureGrad(samp, uvX, dxX, dyX);
						colY = textureGrad(samp, uvY, dxY, dyY);
						colZ = textureGrad(samp, uvZ, dxZ, dyZ);
						if (srgb) {
							colX = sRGBToLinear(colX);
							colY = sRGBToLinear(colY);
							colZ = sRGBToLinear(colZ);
						}
					}

					// Blend based on normal direction
					return colX * blend.x + colY * blend.y + colZ * blend.z;
				}

				// Original wrapper that computes stochastic blend from distance
				vec4 textureTriplanar(sampler2D samp, vec3 worldPos, vec3 worldNormal, float scale, bool srgb, bool useNoTile) {
					if (!useNoTile) {
						return textureTriplanarWithBlend(samp, worldPos, worldNormal, scale, srgb, 0.0);
					}
					float dist = length(worldPos - cameraPosition);
					float stochasticBlend = 1.0 - smoothstep(150.0, 400.0, dist);
					return textureTriplanarWithBlend(samp, worldPos, worldNormal, scale, srgb, stochasticBlend);
				}

				// Convenience overload for normal maps (no sRGB conversion)
				vec4 textureTriplanar(sampler2D samp, vec3 worldPos, vec3 worldNormal, float scale, bool useNoTile) {
					return textureTriplanar(samp, worldPos, worldNormal, scale, false, useNoTile);
				}

				// Triplanar with LOD blending - samples at two scales and blends between them
				// Set srgb=true for albedo textures to convert to linear space
				// Set useNoTile=true to enable stochastic anti-tiling (more expensive)
				vec4 textureTriplanarLOD(sampler2D samp, vec3 worldPos, vec3 worldNormal, float baseScale, vec3 lodInfo, bool srgb, bool useNoTile) {
					float scaleLower = baseScale / lodInfo.x;
					float scaleUpper = baseScale / lodInfo.y;
					float lodBlend = lodInfo.z;

					// Compute stochastic blend based on distance
					float dist = length(worldPos - cameraPosition);
					float stochasticBlend = useNoTile ? (1.0 - smoothstep(150.0, 400.0, dist)) : 0.0;

					// For upper LOD (distant), reduce or disable stochastic sampling
					// This saves texture samples since distant terrain doesn't need anti-tiling
					float stochasticLower = stochasticBlend;
					float stochasticUpper = stochasticBlend * (1.0 - lodBlend); // Fade out for upper LOD

					// Sample at both LOD scales with appropriate stochastic intensity
					vec4 colorLower = textureTriplanarWithBlend(samp, worldPos, worldNormal, scaleLower, srgb, stochasticLower);
					vec4 colorUpper = textureTriplanarWithBlend(samp, worldPos, worldNormal, scaleUpper, srgb, stochasticUpper);

					// Blend between LOD levels
					return mix(colorLower, colorUpper, lodBlend);
				}

				// Convenience overload for normal maps (no sRGB conversion)
				vec4 textureTriplanarLOD(sampler2D samp, vec3 worldPos, vec3 worldNormal, float baseScale, vec3 lodInfo, bool useNoTile) {
					return textureTriplanarLOD(samp, worldPos, worldNormal, baseScale, lodInfo, false, useNoTile);
				}

				// Triplanar normal sampling with proper tangent space blending (UDN method)
				// stochasticBlend controls the intensity of stochastic sampling (0=off, 1=full)
				vec3 normalTriplanarWithBlend(sampler2D samp, vec3 worldPos, vec3 worldNormal, float scale, float stochasticBlend) {
					// Calculate blend weights from world normal
					vec3 blend = abs(worldNormal);
					blend = pow(blend, vec3(4.0));
					blend /= (blend.x + blend.y + blend.z);

					// Calculate UVs for each axis projection
					vec2 uvX = worldPos.zy * scale;
					vec2 uvY = worldPos.xz * scale;
					vec2 uvZ = worldPos.xy * scale;

					// Pre-compute derivatives once for all projections
					vec2 dxX = dFdx(uvX);
					vec2 dyX = dFdy(uvX);
					vec2 dxY = dFdx(uvY);
					vec2 dyY = dFdy(uvY);
					vec2 dxZ = dFdx(uvZ);
					vec2 dyZ = dFdy(uvZ);

					// Sample normals from each projection
					vec3 tnormX, tnormY, tnormZ;
					if (stochasticBlend > 0.01) {
						tnormX = textureNoTileWithDerivs(samp, uvX, dxX, dyX, stochasticBlend, false).xyz * 2.0 - 1.0;
						tnormY = textureNoTileWithDerivs(samp, uvY, dxY, dyY, stochasticBlend, false).xyz * 2.0 - 1.0;
						tnormZ = textureNoTileWithDerivs(samp, uvZ, dxZ, dyZ, stochasticBlend, false).xyz * 2.0 - 1.0;
					} else {
						tnormX = textureGrad(samp, uvX, dxX, dyX).xyz * 2.0 - 1.0;
						tnormY = textureGrad(samp, uvY, dxY, dyY).xyz * 2.0 - 1.0;
						tnormZ = textureGrad(samp, uvZ, dxZ, dyZ).xyz * 2.0 - 1.0;
					}

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

				// Original wrapper that computes stochastic blend from distance
				vec3 normalTriplanar(sampler2D samp, vec3 worldPos, vec3 worldNormal, float scale, bool useNoTile) {
					if (!useNoTile) {
						return normalTriplanarWithBlend(samp, worldPos, worldNormal, scale, 0.0);
					}
					float dist = length(worldPos - cameraPosition);
					float stochasticBlend = 1.0 - smoothstep(150.0, 400.0, dist);
					return normalTriplanarWithBlend(samp, worldPos, worldNormal, scale, stochasticBlend);
				}

				// Triplanar normal with LOD blending
				// Set useNoTile=true to enable stochastic anti-tiling (more expensive)
				vec3 normalTriplanarLOD(sampler2D samp, vec3 worldPos, vec3 worldNormal, float baseScale, vec3 lodInfo, bool useNoTile) {
					float scaleLower = baseScale / lodInfo.x;
					float scaleUpper = baseScale / lodInfo.y;
					float lodBlend = lodInfo.z;

					// Compute stochastic blend based on distance
					float dist = length(worldPos - cameraPosition);
					float stochasticBlend = useNoTile ? (1.0 - smoothstep(150.0, 400.0, dist)) : 0.0;

					// For upper LOD (distant), reduce or disable stochastic sampling
					float stochasticLower = stochasticBlend;
					float stochasticUpper = stochasticBlend * (1.0 - lodBlend);

					// Sample normals at both LOD scales with appropriate stochastic intensity
					vec3 normalLower = normalTriplanarWithBlend(samp, worldPos, worldNormal, scaleLower, stochasticLower);
					vec3 normalUpper = normalTriplanarWithBlend(samp, worldPos, worldNormal, scaleUpper, stochasticUpper);

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

				// Calculate blend factors FIRST so we can skip sampling when blend is zero
				layer0Blend = 1.0; // Base layer always fully visible initially
				${shaderCode.blendCalculations}

				// Sample layer textures (with early-out for layers with zero blend)
				${shaderCode.samplingCode}

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

	// We don't need map/normalMap props since all layers are sampled in custom shader code
	// But we need a normalMap to trigger USE_NORMALMAP define, so pass the first layer's normal
	const baseNormal = layerTextures[TERRAIN_LAYERS[0].name]?.normal

	return <meshStandardMaterial ref={materialRef} normalMap={baseNormal} onBeforeCompile={onBeforeCompile} />
}

export default TerrainMaterial
