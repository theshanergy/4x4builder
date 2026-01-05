uniform mat4 textureMatrix;
uniform float time;

varying vec4 mirrorCoord;
varying vec4 worldPosition;
varying float vDepth;

#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
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

vec3 GerstnerWave(vec4 wave, vec3 p, float waveScale) {
	float steepness = wave.z * waveScale;
	float wavelength = wave.w;
	float k = 2.0 * PI / wavelength;
	float c = sqrt(9.8 / k);
	vec2 d = normalize(wave.xy);
	// Use XZ plane for wave calculation (Y is up in our coordinate system)
	float f = k * (dot(d, vec2(p.x, p.z)) - c * time);
	float a = steepness / k;

	// Return displacement: X horizontal, Y vertical (height), Z horizontal
	return vec3(
		d.x * (a * cos(f)),
		a * sin(f),
		d.y * (a * cos(f))
	);
}

void main() {
	// Calculate depth-based wave scale using smoothstep
	float waveScale = smoothstep(shorelineDepthThreshold, shallowDepthThreshold, depth);
	// Apply cubic smoothstep for more natural falloff
	waveScale = waveScale * waveScale * (3.0 - 2.0 * waveScale);

	// Get world position for seamless wave calculation across tiles
	vec4 worldPos = modelMatrix * vec4(position, 1.0);
	worldPosition = worldPos;
	mirrorCoord = textureMatrix * worldPos;

	// Use world XZ coordinates for wave calculation (ensures seamless tiling)
	vec3 wavePoint = vec3(worldPos.x, worldPos.y, worldPos.z);

	// Start with local position for displacement
	vec3 p = position.xyz;

	// Apply Gerstner waves using world coordinates for seamless waves
	p += GerstnerWave(waveA, wavePoint, waveScale);
	p += GerstnerWave(waveB, wavePoint, waveScale);
	p += GerstnerWave(waveC, wavePoint, waveScale);

	// Pass depth to fragment shader for visual effects
	vDepth = depth;

	gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);

	#include <beginnormal_vertex>
	#include <defaultnormal_vertex>
	#include <logdepthbuf_vertex>
	#include <fog_vertex>
	#include <shadowmap_vertex>
}
