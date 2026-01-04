uniform mat4 textureMatrix;
uniform float time;

varying vec4 mirrorCoord;
varying vec4 worldPosition;

#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>

uniform vec4 waveA;
uniform vec4 waveB;
uniform vec4 waveC;

uniform float offsetX;
uniform float offsetZ;

vec3 GerstnerWave (vec4 wave, vec3 p) {
	float steepness = wave.z;
	float wavelength = wave.w;
	float k = 2.0 * PI / wavelength;
	float c = sqrt(9.8 / k);
	vec2 d = normalize(wave.xy);
	float f = k * (dot(d, vec2(p.x, p.y)) - c * time);
	float a = steepness / k;

	return vec3(
		d.x * (a * cos(f)),
		d.y * (a * cos(f)),
		a * sin(f)
	);
}

void main() {

	mirrorCoord = modelMatrix * vec4( position, 1.0 );
	worldPosition = mirrorCoord.xyzw;
	mirrorCoord = textureMatrix * mirrorCoord;

	vec3 gridPoint = position.xyz;
	vec3 tangent = vec3(1, 0, 0);
	vec3 binormal = vec3(0, 0, 1);
	vec3 p = gridPoint;
	gridPoint.x += offsetX;
	gridPoint.y -= offsetZ;
	p += GerstnerWave(waveA, gridPoint);
	p += GerstnerWave(waveB, gridPoint);
	p += GerstnerWave(waveC, gridPoint);
	gl_Position = projectionMatrix * modelViewMatrix * vec4( p.x, p.y, p.z, 1.0);

	#include <beginnormal_vertex>
	#include <defaultnormal_vertex>
	#include <logdepthbuf_vertex>
	#include <fog_vertex>
	#include <shadowmap_vertex>
}
