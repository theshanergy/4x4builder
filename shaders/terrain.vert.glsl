attribute float roadBlend;      // 0-1 blend factor for height (from JS)
attribute float signedRoadDist; // Signed distance from road center (for lane markings)

varying vec2 vUv;
varying float vSignedRoadDist;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying vec3 vTangent;
varying vec3 vBitangent;

void main() {
    vUv = uv;
    vSignedRoadDist = signedRoadDist;
    vNormal = normalize(normalMatrix * normal);
    
    // Build TBN matrix for normal mapping
    vec3 worldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vec3 tangent = abs(worldNormal.z) < 0.99 
        ? normalize(cross(worldNormal, vec3(0.0, 0.0, 1.0)))
        : normalize(cross(worldNormal, vec3(1.0, 0.0, 0.0)));
    
    vTangent = normalize(normalMatrix * tangent);
    vBitangent = normalize(normalMatrix * cross(worldNormal, tangent));
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
}
