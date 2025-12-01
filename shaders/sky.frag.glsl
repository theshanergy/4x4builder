varying vec3 vDirection;

uniform vec3 sunDirection;
uniform float time;

const float PI = 3.14159265359;
const vec3 UP = vec3(0.0, 1.0, 0.0);

// Sky color parameters - clear desert sky
const vec3 SKY_TOP = vec3(0.35, 0.55, 0.82);      // Deep blue at zenith
const vec3 SKY_HORIZON = vec3(0.75, 0.85, 0.95);  // Pale blue-white at horizon
const vec3 SUN_COLOR = vec3(1.0, 0.95, 0.85);

// Include shared noise functions (snoise and fbm)
#include "./noise.glsl"

// Henyey-Greenstein phase function
float henyeyGreenstein(float cosTheta, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

// Clean sky gradient
vec3 skyGradient(vec3 dir, vec3 sunDir) {
    float elevation = max(0.0, dir.y);
    
    // Smooth gradient from horizon to zenith
    float skyBlend = pow(elevation, 0.5);
    vec3 skyColor = mix(SKY_HORIZON, SKY_TOP, skyBlend);
    
    // Subtle sun influence - warm glow near sun
    float sunDot = max(0.0, dot(dir, sunDir));
    float sunGlow = pow(sunDot, 8.0) * 0.3;
    skyColor += SUN_COLOR * sunGlow * (1.0 - elevation * 0.5);
    
    // Very subtle horizon haze
    float horizonHaze = pow(1.0 - elevation, 12.0) * 0.15;
    skyColor = mix(skyColor, vec3(0.9, 0.92, 0.95), horizonHaze);
    
    // Sun disk
    float sunDisk = smoothstep(0.9997, 0.9999, sunDot);
    skyColor += SUN_COLOR * sunDisk * 15.0;
    
    return skyColor;
}

// Wispy cloud rendering - subtle and thin
vec4 wispyClouds(vec3 dir, vec3 sunDir) {
    if (dir.y < 0.02) return vec4(0.0);
    
    // Project ray onto cloud plane
    float t = 0.5 / dir.y;
    vec3 cloudPos = dir * t;
    
    // Animate clouds slowly
    vec2 windOffset = vec2(time * 0.008, time * 0.003);
    vec2 uv = cloudPos.xz * 0.8 + windOffset;
    
    // Wispy cloud noise - stretched horizontally (using shared simplex noise)
    vec3 noisePos1 = vec3(uv.x * 2.0, uv.y * 0.5, time * 0.01);
    vec3 noisePos2 = vec3(uv.x * 1.5 + 3.0, uv.y * 0.4, time * 0.015);
    
    // Use fbm from shared noise.glsl - remap from [-1,1] to [0,1] range
    float n1 = fbm(noisePos1) * 0.5 + 0.5;
    float n2 = fbm(noisePos2 * 1.5) * 0.5 + 0.5;
    
    // Combine for wispy effect
    float cloudNoise = n1 * 0.6 + n2 * 0.4;
    
    // Very sparse coverage - mostly clear sky
    float coverage = 0.55;
    float cloudShape = smoothstep(coverage, coverage + 0.15, cloudNoise);
    
    // Make clouds thinner/wispier
    cloudShape *= smoothstep(coverage + 0.3, coverage + 0.1, cloudNoise) * 1.5;
    cloudShape = clamp(cloudShape, 0.0, 1.0);
    
    // Fade clouds at horizon and high up
    float verticalFade = smoothstep(0.02, 0.2, dir.y) * smoothstep(0.9, 0.4, dir.y);
    cloudShape *= verticalFade;
    
    // Cloud lighting - bright white clouds
    float lightIntensity = 0.95 + 0.05 * max(0.0, dot(dir, sunDir));
    
    // Cloud color - very bright white
    vec3 cloudColor = vec3(1.0, 1.0, 1.0) * lightIntensity;
    
    // Very subtle warm tint
    cloudColor += vec3(0.02, 0.01, 0.0) * max(0.0, dot(dir, sunDir));
    
    return vec4(cloudColor, cloudShape * 0.6);
}

void main() {
    vec3 dir = normalize(vDirection);
    vec3 sunDir = normalize(sunDirection);
    
    // Sky color - clean gradient
    vec3 skyColor = skyGradient(dir, sunDir);
    
    // Add wispy clouds
    vec4 cloudLayer = wispyClouds(dir, sunDir);
    
    // Blend clouds with sky
    vec3 finalColor = mix(skyColor, cloudLayer.rgb, cloudLayer.a);
    
    // Ground/below horizon
    if (dir.y < 0.0) {
        vec3 groundColor = vec3(0.85, 0.82, 0.78);
        float groundBlend = smoothstep(-0.01, 0.0, dir.y);
        finalColor = mix(groundColor, finalColor, groundBlend);
    }
    
    // Light tone mapping - keep it bright and clean
    finalColor = pow(finalColor, vec3(0.95));
    
    gl_FragColor = vec4(finalColor, 1.0);
}
