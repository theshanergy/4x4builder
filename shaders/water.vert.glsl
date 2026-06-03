uniform mat4 textureMatrix;
uniform float time;

varying vec4 mirrorCoord;
varying vec4 worldPosition;
varying float vDepth;
varying vec2 vWorldXZ;
varying float vCameraDistance;
varying vec2 vFlowDir;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>

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
// Exact world X/Z for this water vertex. This avoids tiny per-tile transform
// differences showing as cracks at glancing camera angles.
attribute vec2 waterWorldPosition;
// Per-vertex flow velocity. Zero means static open-water noise.
attribute vec2 flowDir;

vec3 GerstnerWave(vec4 wave, vec3 p, float waveScale) {
	float steepness = wave.z * waveScale;
	float wavelength = wave.w;
	float k = 2.0 * PI / wavelength;
	float c = sqrt(9.8 / k);
	vec2 d = normalize(wave.xy);
	float f = k * (dot(d, vec2(p.x, p.z)) - c * time);
	float a = steepness / k;

	return vec3(d.x * (a * cos(f)), a * sin(f), d.y * (a * cos(f)));
}

void main() {
	// Calculate depth-based wave scale
	float waveScale = smoothstep(shorelineDepthThreshold, shallowDepthThreshold, depth);
	waveScale = waveScale * waveScale * (3.0 - 2.0 * waveScale);

	// World-space coordinates are shared by neighboring water tiles and stitched
	// to coarse neighbors, so waves/reflections stay continuous across tile edges.
	vec3 worldSpacePos = vec3(waterWorldPosition.x, 0.0, waterWorldPosition.y);

	// Pass to fragment shader for noise calculation
	vWorldXZ = waterWorldPosition;

	// Compute Gerstner wave displacement
	vec3 waveDisplacement = vec3(0.0);
	waveDisplacement += GerstnerWave(waveA, worldSpacePos, waveScale);
	waveDisplacement += GerstnerWave(waveB, worldSpacePos, waveScale);
	waveDisplacement += GerstnerWave(waveC, worldSpacePos, waveScale);

	vec4 worldPos = vec4(
		waterWorldPosition.x + waveDisplacement.x,
		position.y + waveDisplacement.y,
		waterWorldPosition.y + waveDisplacement.z,
		1.0
	);
	worldPosition = worldPos;
	mirrorCoord = textureMatrix * worldPos;

	vDepth = depth;
	vFlowDir = flowDir;

	// Calculate camera distance for distance-based effects
	vec4 mvPosition = viewMatrix * worldPos;
	vCameraDistance = length(mvPosition.xyz);

	gl_Position = projectionMatrix * mvPosition;

	#include <logdepthbuf_vertex>
	#include <fog_vertex>
}
