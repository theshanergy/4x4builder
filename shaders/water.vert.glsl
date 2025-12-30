uniform float uFlowMapSize; // World size covered by flow map

varying vec3 vWorldPos;
varying vec3 vViewDirection;
varying float vViewDistance;
varying vec2 vFlowMapUV;

void main() {
	vec4 worldPos = modelMatrix * vec4(position, 1.0);
	vWorldPos = worldPos.xyz;
	vViewDirection = normalize(cameraPosition - worldPos.xyz);
	vViewDistance = length(cameraPosition - worldPos.xyz);

	// Calculate flow map UV (maps world position to 0-1 range)
	// Flow map is centered on origin, covering uFlowMapSize world units
	vFlowMapUV = (worldPos.xz / uFlowMapSize) + 0.5;

	gl_Position = projectionMatrix * viewMatrix * worldPos;
}
