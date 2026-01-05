uniform mat4 textureMatrix;
uniform float time;

varying vec4 mirrorCoord;
varying vec4 worldPosition;
varying float vDepth;
varying vec2 vWorldXZ; // Original world XZ from UVs for seamless noise

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

// Wave stitch data for LOD boundary interpolation: [c0, c1, t, axis]
// axis: 0 = no stitch needed, 1 = interpolate along X, 2 = interpolate along Z
attribute vec4 waveStitch;

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

// Compute total wave displacement for a given world position
vec3 computeWaveDisplacement(vec3 worldPos, float waveScale) {
	vec3 displacement = vec3(0.0);
	displacement += GerstnerWave(waveA, worldPos, waveScale);
	displacement += GerstnerWave(waveB, worldPos, waveScale);
	displacement += GerstnerWave(waveC, worldPos, waveScale);
	return displacement;
}

void main() {
	// Calculate depth-based wave scale using smoothstep
	float waveScale = smoothstep(shorelineDepthThreshold, shallowDepthThreshold, depth);
	// Apply cubic smoothstep for more natural falloff
	waveScale = waveScale * waveScale * (3.0 - 2.0 * waveScale);

	// UV coordinates are in world space
	vec3 worldSpacePos = vec3(uv.x, 0.0, uv.y);
	
	// Pass world XZ for seamless noise in fragment shader
	vWorldXZ = uv;
	
	// Compute wave displacement, with interpolation for LOD boundary vertices
	vec3 waveDisplacement;
	
	float stitchT = waveStitch.z;
	float stitchAxis = waveStitch.w;
	
	if (stitchT < 0.0) {
		// No stitching needed - use actual UV position
		waveDisplacement = computeWaveDisplacement(worldSpacePos, waveScale);
	} else {
		// Interpolate wave displacement between two coarse grid positions
		// This ensures the fine tile's edge matches the coarse tile's linear interpolation
		float c0 = waveStitch.x;
		float c1 = waveStitch.y;
		
		vec3 pos0, pos1;
		if (stitchAxis > 1.5) {
			// Stitching along Z axis (west/east edge) - X is fixed, Z varies
			pos0 = vec3(uv.x, 0.0, c0);
			pos1 = vec3(uv.x, 0.0, c1);
		} else {
			// Stitching along X axis (south/north edge) - Z is fixed, X varies
			pos0 = vec3(c0, 0.0, uv.y);
			pos1 = vec3(c1, 0.0, uv.y);
		}
		
		vec3 wave0 = computeWaveDisplacement(pos0, waveScale);
		vec3 wave1 = computeWaveDisplacement(pos1, waveScale);
		waveDisplacement = mix(wave0, wave1, stitchT);
	}
	
	// Apply wave displacement to the local position
	vec3 displacedPosition = position + waveDisplacement;
	
	// Transform to world space for fragment shader
	vec4 worldPos = modelMatrix * vec4(displacedPosition, 1.0);
	worldPosition = worldPos;
	mirrorCoord = textureMatrix * worldPos;

	// Pass depth to fragment shader for visual effects
	vDepth = depth;

	// Transform to clip space
	gl_Position = projectionMatrix * viewMatrix * worldPos;
}
