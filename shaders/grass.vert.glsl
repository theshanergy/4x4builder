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

    // Wind influence increases with blade height (squared for natural look)
    float windInfluence = pow(vHeightFactor, 2.0);
    
    // Calculate absolute world position for consistent wind across patches
    vec4 absolutePosition = modelMatrix * worldPosition;

    // Pure Sine Wave Wind System (no noise - better performance)
    // Multiple sine waves at different frequencies create pseudo-random feel
    
    // Primary wind waves
    float wave1 = sin(absolutePosition.x * 0.5 + uTime * uWindFrequency);
    float wave2 = sin(absolutePosition.z * 0.7 + uTime * uWindFrequency * 1.3 + 1.57);
    float wave3 = sin((absolutePosition.x + absolutePosition.z) * 0.3 + uTime * uWindFrequency * 0.7);
    
    // Combine waves for turbulence
    float turbulence = (wave1 + wave2 + wave3) / 3.0;
    
    // Gust simulation using slower sine waves
    float gust1 = sin(absolutePosition.x * 0.05 + uTime * 0.4) * 0.5 + 0.5;
    float gust2 = sin(absolutePosition.z * 0.07 + uTime * 0.3 + 2.0) * 0.5 + 0.5;
    float gustStrength = gust1 * gust2;
    
    // Combine for final wind strength
    float currentStrength = uWindStrength * (0.3 + 0.7 * gustStrength);
    
    // Simplified directional variance using sine
    float dirVariance = sin(absolutePosition.x * 0.1 + uTime * 0.15) * 0.3;
    vec2 windDir = normalize(vec2(1.0, dirVariance));
    
    // Apply displacement
    float displacement = (0.5 + 0.5 * turbulence) * currentStrength * windInfluence;
    
    worldPosition.x += windDir.x * displacement;
    worldPosition.z += windDir.y * displacement;

    gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
}