uniform vec3 uColorBase;
uniform vec3 uColorTip;
uniform float uAmbientStrength;
uniform float uTranslucency;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;

varying vec2 vUv;
varying vec3 vNormal;
varying float vHeightFactor;

void main() {
    // Gradient from base to tip
    vec3 color = mix(uColorBase, uColorTip, vHeightFactor);

    // Use sun direction from shared environment config
    vec3 lightDir = normalize(uSunDirection);
    float diffuse = max(dot(vNormal, lightDir), 0.0);
    
    // Translucency effect - light passing through the blade
    float backLight = max(dot(-vNormal, lightDir), 0.0) * uTranslucency;
    
    // Combine lighting with sun color tinting
    float lighting = uAmbientStrength + diffuse * (1.0 - uAmbientStrength) + backLight;

    // Darken at the very base slightly
    float baseShadow = smoothstep(0.0, 0.15, vHeightFactor);
    lighting *= mix(0.7, 1.0, baseShadow);

    // Apply lighting to color with subtle sun color influence
    vec3 litColor = color * lighting;
    // Tint lit areas slightly toward sun color
    vec3 sunTint = normalize(uSunColor);
    vec3 finalColor = mix(litColor, litColor * sunTint, diffuse * 0.15);

    // Add slight bleaching/sun-worn effect near the tip for dried grass
    float tipBleach = smoothstep(0.6, 1.0, vHeightFactor) * 0.15;
    finalColor = mix(finalColor, vec3(0.9, 0.85, 0.75), tipBleach);

    gl_FragColor = vec4(finalColor, 1.0);
}
