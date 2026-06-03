import { useMemo, useEffect } from 'react'
import { useLoader } from '@react-three/fiber'
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, TextureLoader, Vector4 } from 'three'

import TERRAIN_CONFIG from '../config/terrain'
import { QUADTREE_VIEW_RANGE, QUADTREE_ROOT_SIZE } from '../config/lod'

// Uniform field definitions - maps layer properties to shader uniform names and values
const UNIFORM_FIELDS = [
	{ key: 'TextureScale', path: 'textureScale', condition: () => true },
	{ key: 'NormalScale', path: 'normalScale', condition: (layer) => layer.normalScale !== undefined },
	{ key: 'LODDistance', path: 'lod.distance', condition: (layer) => layer.lod },
	{ key: 'LODLevels', path: 'lod.levels', condition: (layer) => layer.lod },
	{ key: 'LODScaleFactor', path: 'lod.scaleFactor', condition: (layer) => layer.lod, default: 2.0 },
	{ key: 'HeightMin', path: 'height.min', condition: (layer) => layer.height?.min !== undefined },
	{ key: 'HeightMax', path: 'height.max', condition: (layer) => layer.height?.max !== undefined },
	{ key: 'HeightTransitionMin', path: 'height.transitionMin', condition: (layer) => layer.height?.min !== undefined, default: 20.0 },
	{ key: 'HeightTransitionMax', path: 'height.transitionMax', condition: (layer) => layer.height?.max !== undefined, default: 20.0 },
	{ key: 'HeightInfluence', path: 'height.influence', condition: (layer) => layer.height },
	{ key: 'SlopeMin', path: 'slope.min', condition: (layer) => layer.slope?.min !== undefined },
	{ key: 'SlopeMax', path: 'slope.max', condition: (layer) => layer.slope?.max !== undefined },
	{ key: 'SlopeInfluence', path: 'slope.influence', condition: (layer) => layer.slope },
	{ key: 'SlopeTransition', path: 'slope.transition', condition: (layer) => layer.slope, default: 0.1 },
]

// Get nested property value from object using dot notation
const getNestedValue = (obj, path) => path.split('.').reduce((acc, key) => acc?.[key], obj)
const ROAD_WEIGHT_CHANNELS = ['x', 'y', 'z', 'w']
const glslFloat = (value) => {
	const number = Number(value)
	if (!Number.isFinite(number)) return '0.0'
	return Number.isInteger(number) ? `${number}.0` : `${number}`
}
const glslVec3 = (value) => `vec3(${glslFloat(value[0])}, ${glslFloat(value[1])}, ${glslFloat(value[2])})`

const getRoadLayer = (layers) => layers.find((layer) => layer.road?.renderOnTerrain === 'projected')

const getRouteTangent = (samples, index) => {
	const prev = samples[Math.max(0, index - 1)]
	const next = samples[Math.min(samples.length - 1, index + 1)]
	const dx = next.x - prev.x
	const dz = next.z - prev.z
	const len = Math.sqrt(dx * dx + dz * dz)
	if (len < 1e-6) return { x: 0, z: 1 }
	return { x: dx / len, z: dz / len }
}

const drawPolyline = (ctx, points) => {
	if (points.length < 2) return
	ctx.beginPath()
	ctx.moveTo(points[0].x, points[0].y)
	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i].x, points[i].y)
	}
	ctx.stroke()
}

const createRoadProjectionMask = (routes, roadLayer) => {
	if (!roadLayer?.road?.visual?.enabled || !routes.length || typeof document === 'undefined') return null

	const road = roadLayer.road
	const visual = road.visual
	const [textureWidth, textureHeight] = visual.maskResolution ?? [2048, 4096]
	const padding = visual.maskPadding ?? 128
	const laneOffset = road.laneOffset ?? 1.2
	const laneWidth = road.laneWidth ?? 0.35
	const laneFeather = road.laneFeather ?? laneWidth

	let minX = Infinity
	let maxX = -Infinity
	let minZ = Infinity
	let maxZ = -Infinity

	for (const route of routes) {
		const routePadding = (route.visualHalfWidth ?? route.halfWidth ?? laneOffset + laneWidth + laneFeather) + padding
		for (const sample of route.samples) {
			minX = Math.min(minX, sample.x - routePadding)
			maxX = Math.max(maxX, sample.x + routePadding)
			minZ = Math.min(minZ, sample.z - routePadding)
			maxZ = Math.max(maxZ, sample.z + routePadding)
		}
	}

	if (!Number.isFinite(minX) || !Number.isFinite(minZ) || maxX <= minX || maxZ <= minZ) return null

	const canvas = document.createElement('canvas')
	canvas.width = textureWidth
	canvas.height = textureHeight
	const ctx = canvas.getContext('2d')
	const scaleX = textureWidth / (maxX - minX)
	const scaleZ = textureHeight / (maxZ - minZ)
	const lateralScale = Math.max(scaleX, scaleZ)

	ctx.clearRect(0, 0, textureWidth, textureHeight)
	ctx.lineCap = 'round'
	ctx.lineJoin = 'round'
	ctx.strokeStyle = '#ffffff'

	const toCanvas = (x, z) => ({
		x: (x - minX) * scaleX,
		y: textureHeight - (z - minZ) * scaleZ,
	})

	const strokeLane = (points, widthMeters, alpha) => {
		ctx.globalAlpha = alpha
		ctx.lineWidth = Math.max(1, widthMeters * lateralScale)
		drawPolyline(ctx, points)
	}

	for (const route of routes) {
		if (route.samples.length < 2) continue

		for (const side of [-1, 1]) {
			const lanePoints = route.samples.map((sample, index) => {
				const tangent = getRouteTangent(route.samples, index)
				const rightX = -tangent.z
				const rightZ = tangent.x
				return toCanvas(sample.x + rightX * laneOffset * side, sample.z + rightZ * laneOffset * side)
			})

			strokeLane(lanePoints, (laneWidth + laneFeather) * 2.4, 0.22)
			strokeLane(lanePoints, (laneWidth + laneFeather) * 1.45, 0.42)
			strokeLane(lanePoints, laneWidth * 2.0, 0.82)
		}
	}

	ctx.globalAlpha = 1

	const texture = new CanvasTexture(canvas)
	texture.wrapS = ClampToEdgeWrapping
	texture.wrapT = ClampToEdgeWrapping
	texture.minFilter = LinearMipmapLinearFilter
	texture.magFilter = LinearFilter
	texture.generateMipmaps = true
	texture.needsUpdate = true

	return {
		texture,
		bounds: new Vector4(minX, minZ, 1 / (maxX - minX), 1 / (maxZ - minZ)),
	}
}

// Generate shader uniforms and declarations from layer config (single pass)
const generateLayerUniformsAndDeclarations = (layers) => {
	const uniforms = {}
	let declarations = ''

	layers.forEach((layer, index) => {
		const prefix = `uLayer${index}`

		// Add texture declarations
		declarations += `uniform sampler2D ${prefix}Texture;\n`
		declarations += `uniform sampler2D ${prefix}NormalMap;\n`

		// Process uniform fields
		UNIFORM_FIELDS.forEach(({ key, path, condition, default: defaultValue }) => {
			if (condition(layer)) {
				const value = getNestedValue(layer, path)
				// Convert boolean to number for shader uniforms
				const finalValue = value !== undefined ? (typeof value === 'boolean' ? (value ? 1.0 : 0.0) : value) : defaultValue
				uniforms[`${prefix}${key}`] = finalValue
				declarations += `uniform float ${prefix}${key};\n`
			}
		})
	})

	return { uniforms, declarations }
}

// Generate blend factor calculation for a layer
const generateBlendCode = (layer, index) => {
	const hasHeight = layer.height
	const hasSlope = layer.slope

	if (layer.road) {
		if (layer.road.renderOnTerrain === 'projected') {
			const trackOpacity = glslFloat(layer.road.visual?.trackOpacity ?? 1)
			return `
		// Layer ${index} (${layer.name}) - projected road mask
		float layer${index}Blend = 0.0;
		{
			vec2 roadMaskUv${index} = (vWorldPos.xz - uRoadProjectionBounds.xy) * uRoadProjectionBounds.zw;
			if (roadMaskUv${index}.x >= 0.0 && roadMaskUv${index}.x <= 1.0 && roadMaskUv${index}.y >= 0.0 && roadMaskUv${index}.y <= 1.0) {
				layer${index}Blend = texture2D(uRoadProjectionMask, roadMaskUv${index}).a * ${trackOpacity};
			}
		}`
		}

		if (layer.road.renderOnTerrain === false) {
			return `
		// Layer ${index} (${layer.name}) - rendered by the road ribbon mesh
		float layer${index}Blend = 0.0;`
		}

		const channel = ROAD_WEIGHT_CHANNELS[layer.road.weightChannel ?? 0] ?? ROAD_WEIGHT_CHANNELS[0]
		let code = `
		// Layer ${index} (${layer.name}) - spline road mask
		float layer${index}Blend = clamp(vRoadWeights.${channel}, 0.0, 1.0);`

		if (layer.road.edgeNoise) {
			const noise = layer.road.edgeNoise
			const scale = glslFloat(noise.scale ?? 0.08)
			const strength = glslFloat(noise.strength ?? 0.35)
			const innerBlend = glslFloat(noise.innerBlend ?? 0.7)
			const lateralScale = glslFloat(noise.lateralScale ?? 3.0)
			code += `
		{
			float roadEdgeMask${index} = (1.0 - smoothstep(${innerBlend}, 1.0, layer${index}Blend)) * smoothstep(0.02, ${innerBlend}, layer${index}Blend);
			float roadEdgeNoise${index} = valueNoise2D(vec2(vRoadParams.x, vRoadParams.y * ${lateralScale}) * ${scale});
			layer${index}Blend = clamp(layer${index}Blend + (roadEdgeNoise${index} - 0.5) * ${strength} * roadEdgeMask${index}, 0.0, 1.0);
		}`
		}

		return code
	}

	// Base layer or layer with no blend params - always fully visible
	if (!hasHeight && !hasSlope) {
		return `
		// Layer ${index} (${layer.name}) - no blend conditions
		float layer${index}Blend = 1.0;`
	}

	const prefix = `uLayer${index}`
	let code = `
		// Layer ${index} (${layer.name}) blend calculation
		float layer${index}Blend = 1.0;
		{
			float factor;`

	// Height blending
	if (hasHeight) {
		const hasMin = layer.height.min !== undefined
		const hasMax = layer.height.max !== undefined

		if (hasMin && hasMax) {
			// Range: visible between min and max
			code += `
			// Height: visible between min and max
			factor = smoothstep(${prefix}HeightMin - ${prefix}HeightTransitionMin, ${prefix}HeightMin, vWorldPos.y);
			factor *= 1.0 - smoothstep(${prefix}HeightMax, ${prefix}HeightMax + ${prefix}HeightTransitionMax, vWorldPos.y);
			layer${index}Blend *= mix(1.0, factor, ${prefix}HeightInfluence);`
		} else if (hasMin) {
			// Only min: visible above min
			code += `
			// Height: visible above min
			factor = smoothstep(${prefix}HeightMin - ${prefix}HeightTransitionMin, ${prefix}HeightMin + ${prefix}HeightTransitionMin, vWorldPos.y);
			layer${index}Blend *= mix(1.0, factor, ${prefix}HeightInfluence);`
		} else if (hasMax) {
			// Only max: visible below max
			code += `
			// Height: visible below max
			factor = 1.0 - smoothstep(${prefix}HeightMax - ${prefix}HeightTransitionMax, ${prefix}HeightMax + ${prefix}HeightTransitionMax, vWorldPos.y);
			layer${index}Blend *= mix(1.0, factor, ${prefix}HeightInfluence);`
		}
	}

	// Slope blending (slope value: 0 = flat, 1 = vertical)
	if (hasSlope) {
		const hasMin = layer.slope.min !== undefined
		const hasMax = layer.slope.max !== undefined

		code += `
		// Slope factor (0 = flat, 1 = steep)
		float slope${index} = 1.0 - abs(vWorldNormal.y);`

		if (hasMin && hasMax) {
			// Range: visible between min and max slope
			code += `
			// Slope: visible between min and max
			factor = smoothstep(${prefix}SlopeMin - ${prefix}SlopeTransition, ${prefix}SlopeMin, slope${index});
			factor *= 1.0 - smoothstep(${prefix}SlopeMax, ${prefix}SlopeMax + ${prefix}SlopeTransition, slope${index});
			layer${index}Blend *= mix(1.0, factor, ${prefix}SlopeInfluence);`
		} else if (hasMin) {
			// Only min: visible on steeper slopes (above min)
			code += `
			// Slope: visible on steep slopes (above min)
			factor = smoothstep(${prefix}SlopeMin - ${prefix}SlopeTransition, ${prefix}SlopeMin + ${prefix}SlopeTransition, slope${index});
			layer${index}Blend *= mix(1.0, factor, ${prefix}SlopeInfluence);`
		} else if (hasMax) {
			// Only max: visible on flatter slopes (below max)
			code += `
			// Slope: visible on flat slopes (below max)
			factor = 1.0 - smoothstep(${prefix}SlopeMax - ${prefix}SlopeTransition, ${prefix}SlopeMax + ${prefix}SlopeTransition, slope${index});
			layer${index}Blend *= mix(1.0, factor, ${prefix}SlopeInfluence);`
		}
	}

	code += `
	}
	layer${index}Blend = clamp(layer${index}Blend, 0.0, 1.0);`

	return code
}

const generateRoadSurfaceCode = (layer, index) => {
	if (!layer.road) return ''

	let code = ''
	if (Array.isArray(layer.road.tint)) {
		code += `
		layer${index}Color.rgb *= ${glslVec3(layer.road.tint)};`
	}

	if (layer.road.renderOnTerrain === 'projected') {
		const noise = layer.road.laneNoise ?? {}
		const noiseScale = glslFloat(noise.scale ?? 0.12)
		const noiseStrength = noise.strength ?? 0.25
		const rutDarkening = layer.road.rutDarkening ?? 0.8
		code += `
		float projectedRoadNoise${index} = valueNoise2D(vWorldPos.xz * ${noiseScale});
		layer${index}Color.rgb *= mix(vec3(${glslFloat(rutDarkening)}), vec3(${glslFloat(1 + noiseStrength * 0.18)}), projectedRoadNoise${index});`
		return code
	}

	if (layer.road.rutDarkening !== undefined) {
		const laneOffset = glslFloat(layer.road.laneOffset ?? 1.2)
		const laneWidth = layer.road.laneWidth ?? 0.35
		const laneFeather = layer.road.laneFeather ?? laneWidth
		code += `
		float roadLane${index} = 1.0 - smoothstep(${glslFloat(laneWidth)}, ${glslFloat(laneWidth + laneFeather)}, abs(abs(vRoadParams.y) - ${laneOffset}));`

		if (layer.road.laneNoise) {
			const noise = layer.road.laneNoise
			const scale = glslFloat(noise.scale ?? 0.12)
			const strength = noise.strength ?? 0.25
			const lateralScale = glslFloat(noise.lateralScale ?? 4.0)
			code += `
		float roadLaneNoise${index} = valueNoise2D(vec2(vRoadParams.x, vRoadParams.y * ${lateralScale}) * ${scale});
		roadLane${index} *= mix(${glslFloat(1 - strength)}, ${glslFloat(1 + strength * 0.25)}, roadLaneNoise${index});
		roadLane${index} = clamp(roadLane${index}, 0.0, 1.0);`
		}

		code += `
		layer${index}Color.rgb *= mix(vec3(1.0), vec3(${glslFloat(layer.road.rutDarkening)}), roadLane${index});`
	}

	return code
}

// Generate color sampling code for a layer
const generateSamplingCode = (layer, index) => {
	const prefix = `uLayer${index}`
	const hasBlendConditions = layer.height || layer.slope || layer.road
	const normalScaleStr = layer.normalScale !== undefined ? `${prefix}NormalScale` : '1.0'

	// Skip sampling if blend is near zero (optimization for layers with blend conditions)
	const conditionalStart = hasBlendConditions ? `\n	if (layer${index}Blend > 0.01) {` : ''
	const conditionalEnd = hasBlendConditions ? `\n	}` : ''

	// Common initialization
	let code = `
	// Layer ${index} (${layer.name}) - world-space UV${layer.lod ? ' with LOD' : ''}
	vec4 layer${index}Color = vec4(0.0);
	vec3 layer${index}Normal = vWorldNormal;${conditionalStart}`

	// World-space UV mapping
	if (layer.lod) {
		code += `
		vec3 lodInfo${index} = getDistanceLODBlend(vWorldPos, ${prefix}LODDistance, ${prefix}LODLevels, ${prefix}LODScaleFactor);
		float scaleLower${index} = ${prefix}TextureScale / lodInfo${index}.x;
		float scaleUpper${index} = ${prefix}TextureScale / lodInfo${index}.y;
		float lodBlend${index} = lodInfo${index}.z;
		
		vec2 uvLower${index} = vWorldPos.xz * scaleLower${index};
		vec2 uvUpper${index} = vWorldPos.xz * scaleUpper${index};
		
		vec4 colorLower${index} = sRGBToLinear(texture(${prefix}Texture, uvLower${index}));
		vec4 colorUpper${index} = sRGBToLinear(texture(${prefix}Texture, uvUpper${index}));
		layer${index}Color = mix(colorLower${index}, colorUpper${index}, lodBlend${index});
		
		vec3 normalLower${index} = texture(${prefix}NormalMap, uvLower${index}).xyz * 2.0 - 1.0;
		vec3 normalUpper${index} = texture(${prefix}NormalMap, uvUpper${index}).xyz * 2.0 - 1.0;
		vec3 normalSample${index} = mix(normalLower${index}, normalUpper${index}, lodBlend${index});
		normalSample${index}.xy *= ${normalScaleStr};
		// Convert tangent-space normal to world-space using UDN blending for Y-up projection
		layer${index}Normal = normalize(vec3(
			normalSample${index}.x + vWorldNormal.x,
			abs(normalSample${index}.z) * vWorldNormal.y,
			normalSample${index}.y + vWorldNormal.z
		));`
	} else {
		const usePathUV = layer.road?.usePathUV && layer.road.renderOnTerrain !== 'projected'
		const uvExpression = usePathUV ? `vec2(vRoadParams.x, vRoadParams.y) * ${prefix}TextureScale` : `vWorldPos.xz * ${prefix}TextureScale`
		code += `
		vec2 layer${index}UV = ${uvExpression};
		layer${index}Color = sRGBToLinear(texture(${prefix}Texture, layer${index}UV));
		vec3 layer${index}NormalSample = texture(${prefix}NormalMap, layer${index}UV).xyz * 2.0 - 1.0;
		layer${index}NormalSample.xy *= ${normalScaleStr};
		// Convert tangent-space normal to world-space using UDN blending for Y-up projection
		layer${index}Normal = normalize(vec3(
			layer${index}NormalSample.x + vWorldNormal.x,
			abs(layer${index}NormalSample.z) * vWorldNormal.y,
			layer${index}NormalSample.y + vWorldNormal.z
		));${generateRoadSurfaceCode(layer, index)}`
	}

	code += conditionalEnd
	return code
}

// Generate the final color blending code
const generateColorBlendingCode = (layers) => {
	let code = `
	// Blend all layers (first layer is base)
	vec3 finalColor = layer0Color.rgb;
	vec3 finalNormal = layer0Normal;`

	// Blend each subsequent layer on top using its blend factor
	for (let i = 1; i < layers.length; i++) {
		code += `
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
	// Transform world-space normal to view space for lighting calculations
	normal = normalize((viewMatrix * vec4(blendedNormal, 0.0)).xyz);`

	return code
}

/**
 * useTerrainMaterial - Creates a shared MeshStandardMaterial with procedural terrain blending
 *
 * Features:
 * - Preserves standard PBR lighting (identical to meshStandardMaterial)
 * - Config-driven layer system with arbitrary texture layers
 * - Height-based, slope-based, and curvature-based blending
 * - World-space UV mapping
 *
 * @returns {THREE.MeshStandardMaterial} Shared terrain material instance
 */
const useTerrainMaterial = (terrainHelpers) => {
	// Get terrain config
	const terrainConfig = TERRAIN_CONFIG
	const TERRAIN_LAYERS = terrainConfig.layers
	const roadLayer = useMemo(() => getRoadLayer(TERRAIN_LAYERS), [TERRAIN_LAYERS])
	const roadProjection = useMemo(() => {
		const routes = terrainHelpers?.getRoadVisualRoutes?.() ?? []
		return createRoadProjectionMask(routes, roadLayer)
	}, [terrainHelpers, roadLayer])

	// Build texture paths array from layer config
	const texturePaths = useMemo(() => TERRAIN_LAYERS.flatMap((layer) => [layer.textures.albedo, layer.textures.normal]), [TERRAIN_LAYERS])

	// Load all layer textures
	const loadedTextures = useLoader(TextureLoader, texturePaths)

	// Layer textures mapped by layer name, with wrapping configured
	const layerTextures = useMemo(() => {
		const result = {}
		TERRAIN_LAYERS.forEach((layer, index) => {
			const albedo = loadedTextures[index * 2]
			const normal = loadedTextures[index * 2 + 1]

			// Configure wrapping
			if (albedo) albedo.wrapS = albedo.wrapT = RepeatWrapping
			if (normal) normal.wrapS = normal.wrapT = RepeatWrapping

			result[layer.name] = { albedo, normal }
		})
		return result
	}, [loadedTextures, TERRAIN_LAYERS])

	// Pre-generate shader code from config
	const shaderCode = useMemo(() => {
		const { uniforms, declarations } = generateLayerUniformsAndDeclarations(TERRAIN_LAYERS)
		const blendCalculations = TERRAIN_LAYERS.map((layer, i) => generateBlendCode(layer, i)).join('\n')
		const samplingCode = TERRAIN_LAYERS.map((layer, i) => generateSamplingCode(layer, i)).join('\n')
		const colorBlending = generateColorBlendingCode(TERRAIN_LAYERS)
		const normalBlending = generateNormalBlendingCode(TERRAIN_LAYERS)

		return { uniformDeclarations: declarations, uniforms, blendCalculations, samplingCode, colorBlending, normalBlending }
	}, [TERRAIN_LAYERS])

	// Distance fade configuration - terrain fades out at the edges of view distance
	// Account for tile centers: outermost tiles extend half their size beyond the view range
	const fadeEndDistance = QUADTREE_VIEW_RANGE * QUADTREE_ROOT_SIZE - QUADTREE_ROOT_SIZE * 0.5
	const fadeStartDistance = fadeEndDistance * 0.75

	// Shader customization callback
	const onBeforeCompile = useMemo(() => {
		if (!layerTextures) return () => {}
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
			Object.entries(shaderCode.uniforms).forEach(([key, value]) => {
				shader.uniforms[key] = { value }
			})

			// Set distance fade uniforms
			shader.uniforms.uFadeStartDistance = { value: fadeStartDistance }
			shader.uniforms.uFadeEndDistance = { value: fadeEndDistance }
			if (roadProjection) {
				shader.uniforms.uRoadProjectionMask = { value: roadProjection.texture }
				shader.uniforms.uRoadProjectionBounds = { value: roadProjection.bounds }
			}

			// Vertex shader - pass world position
			shader.vertexShader = shader.vertexShader.replace(
				'#include <common>',
				`#include <common>
				attribute vec4 roadWeights;
				attribute vec4 roadParams;
				varying vec3 vWorldPos;
				varying vec3 vWorldNormal;
				varying vec4 vRoadWeights;
				varying vec4 vRoadParams;`
			)

			shader.vertexShader = shader.vertexShader.replace(
				'#include <worldpos_vertex>',
				`#include <worldpos_vertex>
				vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
				vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
				vRoadWeights = roadWeights;
				vRoadParams = roadParams;`
			)

			// Fragment shader - add terrain blending
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <common>',
				`#include <common>
				// Layer uniforms (generated from config)
				${shaderCode.uniformDeclarations}
				// Distance fade uniforms
				uniform float uFadeStartDistance;
				uniform float uFadeEndDistance;
				uniform sampler2D uRoadProjectionMask;
				uniform vec4 uRoadProjectionBounds;

				// Varyings
				varying vec3 vWorldPos;
				varying vec3 vWorldNormal;
				varying vec4 vRoadWeights;
				varying vec4 vRoadParams;

				// Blend factors for each layer
				${TERRAIN_LAYERS.map((_, i) => `float layer${i}Blend;`).join('\n				')}

				// sRGB to linear color space conversion
				vec3 sRGBToLinear(vec3 srgb) {
					return pow(srgb, vec3(2.2));
				}

			vec4 sRGBToLinear(vec4 srgb) {
				return vec4(pow(srgb.rgb, vec3(2.2)), srgb.a);
			}

			float hash12(vec2 p) {
				vec3 p3 = fract(vec3(p.xyx) * 0.1031);
				p3 += dot(p3, p3.yzx + 33.33);
				return fract((p3.x + p3.y) * p3.z);
			}

			float valueNoise2D(vec2 p) {
				vec2 i = floor(p);
				vec2 f = fract(p);
				vec2 u = f * f * (3.0 - 2.0 * f);
				return mix(
					mix(hash12(i + vec2(0.0, 0.0)), hash12(i + vec2(1.0, 0.0)), u.x),
					mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
					u.y
				);
			}

			// Calculate LOD blend info - returns vec3(lowerScale, upperScale, blendFactor)
				vec3 getDistanceLODBlend(vec3 worldPos, float distanceFactor, float lodLevels, float scaleFactor) {
					float dist = length(worldPos - cameraPosition);
					// Calculate continuous LOD level
					float lodContinuous = dist / distanceFactor;
					lodContinuous = clamp(lodContinuous, 0.0, lodLevels - 1.0);

					// Get lower and upper LOD levels
					float lodLower = floor(lodContinuous);
					float lodUpper = min(lodLower + 1.0, lodLevels - 1.0);

					// Blend factor between levels (0 = fully lower, 1 = fully upper)
					float blend = fract(lodContinuous);
					// Apply smoothstep for smoother transition
					blend = smoothstep(0.0, 1.0, blend);

					// Return scales for both LODs and blend factor
					return vec3(pow(scaleFactor, lodLower), pow(scaleFactor, lodUpper), blend);
				}

`
			)

			// Modify diffuse color after it's set
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <map_fragment>',
				`#include <map_fragment>

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

			// Add distance-based alpha fade at the end of the shader
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <dithering_fragment>',
				`#include <dithering_fragment>

				// Distance-based fade to hide terrain edges
				float distanceToCamera = length(vWorldPos - cameraPosition);
				float distanceFade = 1.0 - smoothstep(uFadeStartDistance, uFadeEndDistance, distanceToCamera);
				gl_FragColor.a *= distanceFade;`
			)
		}
	}, [layerTextures, shaderCode, TERRAIN_LAYERS, fadeStartDistance, fadeEndDistance, roadProjection])

	// We don't need map/normalMap props since all layers are sampled in custom shader code
	// But we need a normalMap to trigger USE_NORMALMAP define, so pass the first layer's normal
	const baseNormal = layerTextures?.[TERRAIN_LAYERS[0].name]?.normal

	// Create and configure the material
	const material = useMemo(() => {
		if (!layerTextures || !baseNormal) return null
		const mat = new MeshStandardMaterial({
			normalMap: baseNormal,
			transparent: true,
		})
		mat.onBeforeCompile = onBeforeCompile
		mat.needsUpdate = true
		return mat
	}, [layerTextures, baseNormal, onBeforeCompile])

	// Dispose material when it changes
	useEffect(() => {
		const currentMaterial = material
		return () => {
			if (currentMaterial) {
				currentMaterial.dispose()
			}
		}
	}, [material])

	useEffect(() => {
		const currentTexture = roadProjection?.texture
		return () => {
			currentTexture?.dispose()
		}
	}, [roadProjection])

	return material
}

export default useTerrainMaterial
