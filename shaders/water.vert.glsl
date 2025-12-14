varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewDirection;
varying float vViewDistance;

void main() {
	vUv = uv;
	vec4 worldPos = modelMatrix * vec4(position, 1.0);
	// Use world position for stable UV coordinates that don't shift with camera
	vWorldPos = worldPos.xyz;
	vViewDirection = normalize(cameraPosition - worldPos.xyz);
	vViewDistance = length(cameraPosition - worldPos.xyz);
	gl_Position = projectionMatrix * viewMatrix * worldPos;
}
