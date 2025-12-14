varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vViewDirection;
varying float vViewDistance;

void main() {
	vUv = uv;
	vec4 worldPos = modelMatrix * vec4(position, 1.0);
	vWorldPosition = worldPos.xyz;
	vViewDirection = normalize(cameraPosition - worldPos.xyz);
	vViewDistance = length(cameraPosition - worldPos.xyz);
	gl_Position = projectionMatrix * viewMatrix * worldPos;
}
