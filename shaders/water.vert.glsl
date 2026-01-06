uniform mat4 textureMatrix;
uniform float time;

varying vec4 mirrorCoord;
varying vec4 worldPosition;
varying float vDepth;
varying vec2 vWorldXZ;
varying float vCameraDistance;

#include <common>

uniform vec4 waveA;
uniform vec4 waveB;
uniform vec4 waveC;

uniform float offsetX;
uniform float offsetZ;

// Depth-based wave modulation thresholds
uniform float shorelineDepthThreshold;
uniform float shallowDepthThreshold;

// Per-vertex depth attribute (distance from water surface to terrain)
attribute float depth;

vec3 GerstnerWave(vec4 wave, vec3 p, float waveScale) {
	float steepness = wave.z * waveScale;
	float wavelength = wave.w;
	float k = 2.0 * PI / wavelength;
	float c = sqrt(9.8 / k);
	vec2 d = normalize(wave.xy);
	float f = k * (dot(d, vec2(p.x, p.z)) - c * time);
	float a = steepness / k;

	return vec3(
		d.x * (a * cos(f)),
		a * sin(f),
		d.y * (a * cos(f))
	);
}

void main() {
	// Calculate depth-based wave scale
	float waveScale = smoothstep(shorelineDepthThreshold, shallowDepthThreshold, depth);
	waveScale = waveScale * waveScale * (3.0 - 2.0 * waveScale);

	// UV coordinates are in world space
	// At LOD boundaries, these match the coarse neighbor due to interpolation
	// This ensures seamless wave calculations across tiles
	vec3 worldSpacePos = vec3(uv.x, 0.0, uv.y);
	
	// Pass to fragment shader for noise calculation
	vWorldXZ = uv;
	
	// Compute Gerstner wave displacement
	vec3 waveDisplacement = vec3(0.0);
	waveDisplacement += GerstnerWave(waveA, worldSpacePos, waveScale);
	waveDisplacement += GerstnerWave(waveB, worldSpacePos, waveScale);
	waveDisplacement += GerstnerWave(waveC, worldSpacePos, waveScale);
	
	// Apply displacement to local position
	vec3 displacedPosition = position + waveDisplacement;
	
	// Transform to world space
	vec4 worldPos = modelMatrix * vec4(displacedPosition, 1.0);
	worldPosition = worldPos;
	mirrorCoord = textureMatrix * worldPos;

	vDepth = depth;
	
	// Calculate camera distance for distance-based effects
	vec4 viewPos = viewMatrix * worldPos;
	vCameraDistance = length(viewPos.xyz);

	gl_Position = projectionMatrix * viewMatrix * worldPos;
}
