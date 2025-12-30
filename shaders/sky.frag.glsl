varying vec3 vDirection;

uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uSkyHorizonColor;

const float PI = 3.14159265359;

// Include shared utilities
#include "./noise.glsl"
#include "./atmosphere.glsl"

// Henyey-Greenstein phase function for cloud scattering
float henyeyGreenstein(float cosTheta, float g) {
	float g2 = g * g;
	return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

// Wispy cloud rendering - subtle and thin
vec4 wispyClouds(vec3 dir, vec3 sunDir) {
	if(dir.y < 0.02)
		return vec4(0.0);

	// Project ray onto cloud plane
	float t = 0.5 / dir.y;
	vec3 cloudPos = dir * t;

	// Animate clouds slowly
	vec2 windOffset = vec2(uTime * 0.008, uTime * 0.003);
	vec2 uv = cloudPos.xz * 0.8 + windOffset;

	// Wispy cloud noise - stretched horizontally (using shared simplex noise)
	vec3 noisePos1 = vec3(uv.x * 2.0, uv.y * 0.5, uTime * 0.01);
	vec3 noisePos2 = vec3(uv.x * 1.5 + 3.0, uv.y * 0.4, uTime * 0.015);

	// Use fbm from shared noise.glsl - remap from [-1,1] to [0,1] range
	float n1 = fbm(noisePos1) * 0.5 + 0.5;
	float n2 = fbm(noisePos2 * 1.5) * 0.5 + 0.5;

	// Combine for wispy effect
	float cloudNoise = n1 * 0.6 + n2 * 0.4;

	// Very sparse coverage - mostly clear sky
	float coverage = 0.55;
	float cloudShape = smoothstep(coverage, coverage + 0.15, cloudNoise);

	// Make clouds thinner/wispier
	cloudShape *= smoothstep(coverage + 0.3, coverage + 0.1, cloudNoise) * 1.5;
	cloudShape = clamp(cloudShape, 0.0, 1.0);

	// Fade clouds at horizon and high up
	float verticalFade = smoothstep(0.02, 0.2, dir.y) * smoothstep(0.9, 0.4, dir.y);
	cloudShape *= verticalFade;

	// Cloud lighting - bright white clouds with sun tint
	float sunInfluence = max(0.0, dot(dir, sunDir));
	float lightIntensity = 0.95 + 0.05 * sunInfluence;

	// Cloud color - white with subtle sun color tint
	vec3 cloudColor = vec3(1.0) * lightIntensity;
	cloudColor += uSunColor * 0.02 * sunInfluence;

	return vec4(cloudColor, cloudShape * 0.6);
}

void main() {
	vec3 dir = normalize(vDirection);
	vec3 sunDir = normalize(uSunDirection);

	// Sky color using shared algorithm
	vec3 skyColor = GetSkyColour(dir, sunDir, uSkyColor, uSkyHorizonColor, uSunColor);

	// Sun disk (bright) - matching old sky intensity
	float sunDot = dot(dir, sunDir);
	float sunDisk = smoothstep(0.9997, 0.9999, sunDot);
	skyColor += uSunColor * sunDisk * 15.0;

	// Add wispy clouds
	vec4 cloudLayer = wispyClouds(dir, sunDir);

	// Blend clouds with sky
	vec3 finalColor = mix(skyColor, cloudLayer.rgb, cloudLayer.a);

	// Apply shared final color processing (tonemapping + contrast)
	finalColor = FinalColorProcess(finalColor);

	gl_FragColor = vec4(finalColor, 1.0);
}
