uniform sampler2D sandMap;
uniform sampler2D sandNormalMap;
uniform float opacity;

varying vec2 vUv;
varying float vSignedRoadDist;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying vec3 vTangent;
varying vec3 vBitangent;

// Simple hash for procedural noise
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Value noise for asphalt texture variation
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

void main() {
    // Sand texture with normal mapping (scaled 0.33x for larger detail)
    vec4 sandColor = texture2D(sandMap, vUv);
    vec3 normalMapSample = texture2D(sandNormalMap, vUv * 0.33).rgb * 2.0 - 1.0;
    vec3 sandNormal = normalize(mat3(vTangent, vBitangent, vNormal) * normalMapSample);
    
    // Procedural asphalt: multi-octave noise for color variation
    vec2 wp = vWorldPosition.xz;
    float asphaltNoise = noise(wp * 2.0) * 0.08 + noise(wp * 8.0) * 0.04 + noise(wp * 0.5) * 0.03;
    vec3 asphaltColor = vec3(0.15, 0.15, 0.16) + vec3(asphaltNoise - 0.06);
    
    // Lane markings: yellow dashed center line, white solid edge lines
    float absDist = abs(vSignedRoadDist);
    float lineEdge = smoothstep(0.075, 0.15, absDist); // Line width ~0.15m
    float centerLine = (1.0 - lineEdge) * step(0.25, fract(vWorldPosition.z * 0.083)); // Dash pattern
    float edgeLines = max(
        1.0 - smoothstep(0.075, 0.15, abs(vSignedRoadDist + 5.8)), // Left edge at -5.8m
        1.0 - smoothstep(0.075, 0.15, abs(vSignedRoadDist - 5.8))  // Right edge at +5.8m
    );
    
    vec3 roadWithLines = mix(asphaltColor, vec3(0.95, 0.75, 0.1), centerLine * 0.95); // Yellow
    roadWithLines = mix(roadWithLines, vec3(0.95), edgeLines * 0.95); // White
    
    // Blend road/terrain: sharp edge at 7m half-width (6.8-7.2m transition)
    float roadFactor = 1.0 - smoothstep(6.8, 7.2, absDist);
    vec3 baseColor = mix(sandColor.rgb, roadWithLines, roadFactor);
    vec3 finalNormal = mix(sandNormal, vNormal, roadFactor); // Flat normal on road
    
    // Simple Blinn-Phong lighting with slight specular on road
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float NdotL = max(dot(finalNormal, lightDir), 0.0);
    vec3 halfDir = normalize(lightDir + normalize(vViewPosition));
    float spec = pow(max(dot(finalNormal, halfDir), 0.0), 32.0) * roadFactor * 0.09;
    
    gl_FragColor = vec4(baseColor * (0.5 + NdotL * 0.7) + vec3(spec), opacity); // 0.5 ambient + 0.7 diffuse
}
