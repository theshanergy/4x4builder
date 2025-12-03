#include "noise.glsl"

uniform float uTime;
uniform float uWindStrength;
uniform float uWindFrequency;

varying vec2 vUv;
varying vec3 vNormal;
varying float vHeightFactor;

void main() {
    vUv = uv;
    
    // Height factor for color gradient and wind influence
    vHeightFactor = uv.y;
    
    vec3 pos = position;
    
    vec4 worldPosition = vec4(pos, 1.0);

    #ifdef USE_INSTANCING
        worldPosition = instanceMatrix * worldPosition;

        // Outward lean effect - use local blade position (just the geometry offset from blade base)
        // The lean should be based on the blade's own curve, not world position
        // Use the original vertex position which is in blade-local space
        float localDist = length(position.xz);
        vec2 leanDir = (localDist > 0.001) ? normalize(position.xz) : vec2(0.0);
        
        // Apply lean in local space then transform - small subtle effect
        float leanAmount = 0.02 * pow(vHeightFactor, 2.0);
        
        worldPosition.x += leanDir.x * leanAmount;
        worldPosition.z += leanDir.y * leanAmount;
        
        // Transform normal
        mat3 instanceNormalMatrix = mat3(instanceMatrix);
        vNormal = normalize(normalMatrix * instanceNormalMatrix * normal);
    #else
        vNormal = normalize(normalMatrix * normal);
    #endif

    // Global Wind Calculation (applied in Object Space)
    float windInfluence = pow(vHeightFactor, 2.0);
    
    // Calculate absolute world position for consistent wind across multiple patches
    vec4 absolutePosition = modelMatrix * worldPosition;

    // Organic Wind Simulation
    
    // 1. Gust Envelope (Low frequency, large scale)
    // Creates the "lull then gust" effect
    // Time scale is slower than the wave frequency
    float gustTime = uTime * 0.5;
    float gustNoise = snoise(vec3(absolutePosition.xz * 0.05, gustTime));
    
    // Remap noise to 0..1 range with a bias towards lulls
    // smoothstep helps define the transition between calm and windy
    float gustStrength = smoothstep(-0.4, 0.8, gustNoise);
    
    // 2. Wind Turbulence (Higher frequency)
    // The actual waving motion of the grass
    float turbulenceTime = uTime * uWindFrequency;
    // Use position to create wave fronts
    float turbulence = snoise(vec3(absolutePosition.xz * 0.2 + vec2(turbulenceTime), turbulenceTime * 0.2));
    
    // 3. Combine for final wind vector
    // Base wind (always present) + Gusts
    float currentStrength = uWindStrength * (0.1 + 0.9 * gustStrength);
    
    // Directional variance
    // Wind isn't perfectly straight, it swirls slightly
    float dirNoise = snoise(vec3(absolutePosition.xz * 0.1, uTime * 0.1));
    vec2 windDir = normalize(vec2(1.0, 0.5 * dirNoise)); // Primary wind direction X+
    
    // Apply displacement
    // We add a static lean (wind pushing it over) + turbulence (fluttering)
    float displacement = (0.5 + 0.5 * turbulence) * currentStrength * windInfluence;
    
    worldPosition.x += windDir.x * displacement;
    worldPosition.z += windDir.y * displacement;
    
    gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
}
