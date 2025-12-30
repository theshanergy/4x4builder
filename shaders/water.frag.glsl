uniform float uTime;
uniform sampler2D uNormalMap;
uniform vec3 uWaterColor;
uniform vec3 uDeepColor;
uniform vec3 uSkyColor;
uniform vec3 uSkyHorizonColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uDistortionScale;
uniform float uWaveSpeed;
uniform float uWaveScale;
uniform float uNormalStrength;
uniform float uOpacity;
uniform float uNearFade;
uniform float uFarFade;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDirection;
varying float vViewDistance;

// Attempt to work around GLSL mod issues for negative numbers
vec2 safemod(vec2 x, float m) {
	return x - floor(x / m) * m;
}

// Blend two normal maps using Reoriented Normal Mapping (more physically accurate)
vec3 blendNormals(vec3 n1, vec3 n2) {
	n1 += vec3(0.0, 0.0, 1.0);
	n2 *= vec3(-1.0, -1.0, 1.0);
	return normalize(n1 * dot(n1, n2) - n2 * n1.z);
}

// GGX/Trowbridge-Reitz distribution for realistic specular
float distributionGGX(float NdotH, float roughness) {
	float a = roughness * roughness;
	float a2 = a * a;
	float NdotH2 = NdotH * NdotH;
	float denom = NdotH2 * (a2 - 1.0) + 1.0;
	return a2 / (3.14159265 * denom * denom);
}

// Geometry function for GGX
float geometrySchlickGGX(float NdotV, float roughness) {
	float r = roughness + 1.0;
	float k = (r * r) / 8.0;
	return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(float NdotV, float NdotL, float roughness) {
	return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

void main() {
	// Calculate opacity based on distance from camera with near/far falloff
	float distanceOpacity = mix(0.7, 1.0, smoothstep(uNearFade, uFarFade, vViewDistance));
	
	// Multi-layered UV animation for seamless tiling waves
	// Use world position for UV calculations so water doesn't shift when orbiting camera
	float time = uTime * uWaveSpeed;
	vec2 worldXZ = safemod(vWorldPos.xz, 1000.0);
	
	// Four wave layers at different scales and speeds for natural look
	vec2 uv1 = worldXZ * uWaveScale + vec2(time * 0.7, time * 0.5);
	vec2 uv2 = worldXZ * uWaveScale * 0.6 + vec2(-time * 0.4, time * 0.6);
	vec2 uv3 = worldXZ * uWaveScale * 1.4 + vec2(time * 0.25, -time * 0.35);
	vec2 uv4 = worldXZ * uWaveScale * 2.1 + vec2(-time * 0.15, -time * 0.2);
	
	// Sample normal maps
	vec3 normal1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;
	vec3 normal2 = texture2D(uNormalMap, uv2).rgb * 2.0 - 1.0;
	vec3 normal3 = texture2D(uNormalMap, uv3).rgb * 2.0 - 1.0;
	vec3 normal4 = texture2D(uNormalMap, uv4).rgb * 2.0 - 1.0;
	
	// Blend normals properly using reoriented normal mapping
	vec3 blended1 = blendNormals(normal1, normal2);
	vec3 blended2 = blendNormals(normal3, normal4 * 0.5);
	vec3 normal = blendNormals(blended1, blended2 * 0.6);
	
	// Apply normal strength with distance-based falloff for smoother distant water
	float distanceFalloff = 1.0 - smoothstep(100.0, 400.0, vViewDistance);
	float effectiveNormalStrength = uNormalStrength * (0.3 + 0.7 * distanceFalloff);
	normal.xy *= effectiveNormalStrength;
	normal = normalize(normal);
	
	// Convert to world space (water is flat, so simple transform)
	vec3 worldNormal = normalize(vec3(normal.x * uDistortionScale, 1.0, normal.y * uDistortionScale));
	
	// Calculate key dot products
	vec3 viewDir = normalize(vViewDirection);
	vec3 halfVector = normalize(viewDir + uSunDirection);
	float NdotV = max(dot(worldNormal, viewDir), 0.001);
	float NdotL = max(dot(worldNormal, uSunDirection), 0.0);
	float NdotH = max(dot(worldNormal, halfVector), 0.0);
	float VdotH = max(dot(viewDir, halfVector), 0.0);
	
	// Fresnel effect using Schlick's approximation with proper IOR for water (1.33)
	// F0 for water is approximately 0.02
	float F0 = 0.02;
	float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);
	// Boost fresnel slightly for more visible reflections while keeping it physical
	fresnel = clamp(fresnel * 1.5, 0.0, 0.95);
	
	// Sky reflection with improved gradient
	vec3 reflectDir = reflect(-viewDir, worldNormal);
	
	// More sophisticated sky gradient with multiple zones
	float skyHeight = reflectDir.y;
	float horizonBlend = smoothstep(-0.15, 0.3, skyHeight);
	float zenithBlend = smoothstep(0.3, 0.8, skyHeight);
	
	// Blend between horizon, mid-sky, and zenith colors
	vec3 midSkyColor = mix(uSkyHorizonColor, uSkyColor, 0.5);
	vec3 envColor = mix(uSkyHorizonColor, midSkyColor, horizonBlend);
	envColor = mix(envColor, uSkyColor * 0.9, zenithBlend);
	
	// Add subtle color variation based on reflection direction for more natural look
	float colorVariation = sin(reflectDir.x * 2.0 + reflectDir.z * 1.5) * 0.03;
	envColor += colorVariation;
	
	// PBR-based specular using GGX distribution
	float roughness = 0.15; // Water is quite smooth
	float D = distributionGGX(NdotH, roughness);
	float G = geometrySmith(NdotV, NdotL, roughness);
	float F_spec = F0 + (1.0 - F0) * pow(1.0 - VdotH, 5.0);
	
	// Cook-Torrance specular
	float specularStrength = (D * G * F_spec) / (4.0 * NdotV * NdotL + 0.001);
	specularStrength = clamp(specularStrength, 0.0, 10.0); // Prevent extreme values
	
	// Add softer secondary specular for sun glow
	float sunGlow = pow(max(dot(reflectDir, uSunDirection), 0.0), 16.0) * 0.3;
	
	// Combine specular components
	vec3 specular = uSunColor * (specularStrength * 0.4 + sunGlow) * NdotL;
	
	// Distance from mesh center for depth variation
	float distanceFromCenter = length(vWorldPos.xz) / 400.0;
	distanceFromCenter = clamp(distanceFromCenter, 0.0, 1.0);
	
	// Improved depth-based coloring that's less dependent on view angle
	// Use a combination of fresnel and distance for more consistent look
	float depthFactor = 0.5 + (1.0 - fresnel) * 0.4;
	depthFactor *= (1.0 - distanceFromCenter * 0.2);
	
	// Subtle view-angle influence (looking down shows more of water color)
	float viewAngle = max(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0);
	depthFactor = mix(depthFactor, depthFactor * 1.2, viewAngle * 0.3);
	
	// Calculate water base color with smooth depth transition
	vec3 waterBaseColor = mix(uDeepColor, uWaterColor, depthFactor);
	
	// Subtle subsurface scattering simulation
	// Light passing through water from sun direction
	float sssDot = max(dot(-viewDir, uSunDirection), 0.0);
	float sss = pow(sssDot, 3.0) * 0.15 * (1.0 - fresnel);
	vec3 sssColor = uWaterColor * uSunColor * sss;
	
	// Ambient lighting from sky
	vec3 ambientLight = mix(uSkyHorizonColor, uSkyColor, 0.3) * 0.08;
	
	// Add subtle caustic-like brightness variation
	float causticTime = uTime * 0.8;
	vec2 causticUV = worldXZ * 0.05;
	float caustic1 = sin(causticUV.x * 3.0 + causticTime) * cos(causticUV.y * 2.5 - causticTime * 0.7);
	float caustic2 = sin(causticUV.x * 2.0 - causticTime * 0.5) * cos(causticUV.y * 3.5 + causticTime * 0.4);
	float causticBrightness = (caustic1 + caustic2) * 0.015 + 1.0;
	
	// Combine all lighting components
	vec3 waterContrib = waterBaseColor * causticBrightness + sssColor + ambientLight;
	vec3 reflectionContrib = envColor;
	
	// Final color blend using fresnel
	// Lerp between water color and reflection based on fresnel
	vec3 color = mix(waterContrib, reflectionContrib, fresnel * 0.7);
	
	// Add specular on top (additive)
	color += specular;
	
	// Subtle tone mapping to prevent harsh highlights
	color = color / (color + 0.5) * 1.3;
	
	// Apply distance-based opacity falloff
	float finalOpacity = uOpacity * distanceOpacity;
	
	gl_FragColor = vec4(color, finalOpacity);
}
