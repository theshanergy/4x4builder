uniform float uTime;
uniform sampler2D uNormalMap;
uniform samplerCube uEnvMap;
uniform vec3 uWaterColor;
uniform vec3 uDeepColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uDistortionScale;
uniform float uWaveSpeed;
uniform float uWaveScale;
uniform float uNormalStrength;
uniform float uOpacity;
uniform float uShoreRadius;
uniform float uNearFade;
uniform float uFarFade;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vViewDirection;
varying float vViewDistance;

void main() {
	// Calculate distance from shore (origin is at center, shore is at uShoreRadius)
	float distFromOrigin = length(vWorldPosition.xz);
	float distFromShore = distFromOrigin - uShoreRadius;
	
	// Calculate opacity based on distance from camera with near/far falloff
	// Ranges from 0.6 (near camera) to 1.0 (far from camera)
	float distanceOpacity = mix(0.6, 1.0, smoothstep(uNearFade, uFarFade, vViewDistance));

	// Scale noise by distance to reduce grid effect (subtle falloff to maintain wave consistency)
	float noiseScale = mix(1.0, 0.7, smoothstep(0.0, 600.0, distFromShore));
	
	// Multi-layered UV animation for seamless tiling waves
	float time = uTime * uWaveSpeed;
	vec2 uv1 = vWorldPosition.xz * uWaveScale * noiseScale + vec2(time * 0.8, time * 0.6);
	vec2 uv2 = vWorldPosition.xz * uWaveScale * 0.8 * noiseScale - vec2(time * 0.5, time * 0.9);
	vec2 uv3 = vWorldPosition.xz * uWaveScale * 1.3 * noiseScale + vec2(time * 0.3, -time * 0.4);
	
	// Sample and blend normal maps
	vec3 normal1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;
	vec3 normal2 = texture2D(uNormalMap, uv2).rgb * 2.0 - 1.0;
	vec3 normal3 = texture2D(uNormalMap, uv3).rgb * 2.0 - 1.0;
	vec3 normal = normalize(normal1 + normal2 * 0.5 + normal3 * 0.3);
	
	// Apply normal strength (controls wave contrast)
	normal.xy *= uNormalStrength;
	
	// Convert to world space (water is flat, so simple transform)
	vec3 worldNormal = normalize(vec3(normal.x * uDistortionScale, 1.0, normal.y * uDistortionScale));
	
	// Fresnel effect
	float fresnel = pow(1.0 - max(dot(vViewDirection, worldNormal), 0.0), 3.0);
	fresnel = mix(0.1, 1.0, fresnel);
	
	// Environment reflection
	vec3 reflectDir = reflect(-vViewDirection, worldNormal);
	vec3 envColor = textureCube(uEnvMap, reflectDir).rgb;
	
	// Sun specular highlight
	float sunSpec = pow(max(dot(reflectDir, uSunDirection), 0.0), 256.0);
	vec3 specular = uSunColor * sunSpec * 2.0;
	
	// Depth-based color (fake depth based on view angle)
	float depthFactor = pow(max(dot(vViewDirection, vec3(0.0, 1.0, 0.0)), 0.0), 0.5);
	vec3 waterBaseColor = mix(uDeepColor, uWaterColor, depthFactor);
	
	// Final color: blend water color with reflection based on fresnel
	vec3 color = mix(waterBaseColor, envColor, fresnel * 0.6) + specular;
	
	// Apply distance-based opacity falloff
	float finalOpacity = uOpacity * distanceOpacity;
	
	gl_FragColor = vec4(color, finalOpacity);
}
