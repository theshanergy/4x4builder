uniform sampler2D mirrorSampler;
uniform float alpha;
uniform float time;
uniform float size;
uniform float distortionScale;
uniform sampler2D normalSampler;
uniform vec3 sunColor;
uniform vec3 sunDirection;
uniform vec3 eye;
uniform vec3 waterColor;

// Sky shader integration
uniform vec3 skyColor;
uniform vec3 skyHorizonColor;

// Depth-based visual effects
uniform float maxVisibleDepth;
uniform float edgeFadeDistance;

varying vec4 mirrorCoord;
varying vec4 worldPosition;
varying float vDepth;
varying vec2 vWorldXZ; // Original world XZ from UVs for seamless noise
varying float vCameraDistance;

vec4 getNoise( vec2 uv ) {
	vec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);
	vec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );
	vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );
	vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );
	vec4 noise = texture2D( normalSampler, uv0 ) +
		texture2D( normalSampler, uv1 ) +
		texture2D( normalSampler, uv2 ) +
		texture2D( normalSampler, uv3 );
	return noise * 0.5 - 1.0;
}

void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {
	vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );
	float direction = max( 0.0, dot( eyeDirection, reflection ) );
	specularColor += pow( direction, shiny ) * sunColor * spec;
	diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;
}

// Shared atmospheric sky function
vec3 GetSkyColour(vec3 vRayDir, vec3 vSunDir, vec3 vSkyColor, vec3 vSkyHorizonColor, vec3 vSunColor) {
	float elevation = max(0.0, vRayDir.y);
	float skyBlend = pow(elevation, 0.5);
	vec3 vSkyColour = mix(vSkyHorizonColor, vSkyColor, skyBlend);

	// Subtle sun glow near sun position
	float fSunDotV = max(0.0, dot(vSunDir, vRayDir));
	float sunGlow = pow(fSunDotV, 8.0) * 0.3;
	vSkyColour += vSunColor * sunGlow * (1.0 - elevation * 0.5);

	// Very subtle horizon haze
	float horizonHaze = pow(1.0 - elevation, 12.0) * 0.15;
	vSkyColour = mix(vSkyColour, vec3(0.9, 0.92, 0.95), horizonHaze);

	return vSkyColour;
}

vec3 FinalColorProcess(vec3 color) {
	return pow(color, vec3(0.95));
}

#include <common>

void main() {

	// Use original world XZ (from UVs) for seamless noise across tiles
	// This ensures consistent noise calculation at LOD boundaries
	vec4 noise = getNoise( vWorldXZ * size );
	vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );

	vec3 diffuseLight = vec3(0.0);
	vec3 specularLight = vec3(0.0);

	vec3 worldToEye = eye-worldPosition.xyz;
	vec3 eyeDirection = normalize( worldToEye );
	sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );

	float distance = length(worldToEye);

	// Calculate reflection UV from mirror coordinates
	// Protect against division issues when w is very small (looking straight down)
	float mirrorW = max(mirrorCoord.w, 0.001);
	vec2 baseReflectionUV = mirrorCoord.xy / mirrorW;
	
	// Apply distortion based on surface normal and distance
	vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;
	vec2 reflectionUV = baseReflectionUV + distortion;
	
	// Check if reflection UV is valid (within texture bounds with margin)
	// When looking nearly straight down, UVs can become invalid
	bool validReflection = reflectionUV.x > 0.0 && reflectionUV.x < 1.0 && 
	                       reflectionUV.y > 0.0 && reflectionUV.y < 1.0 &&
	                       mirrorCoord.w > 0.1;
	
	vec3 reflectionSample = validReflection ? vec3( texture2D( mirrorSampler, reflectionUV ) ) : vec3(0.0);

	float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );
	float rf0 = 0.3;
	float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );

	// Use sky color for non-reflected rays
	vec3 reflectionDir = reflect( -eyeDirection, surfaceNormal );
	vec3 skyReflection = GetSkyColour( reflectionDir, normalize(sunDirection), skyColor, skyHorizonColor, sunColor );

	// Fade mirror reflection based on mirrorCoord.w to handle steep angles smoothly
	// When looking straight down, w becomes small and reflections become invalid
	float mirrorBlend = validReflection ? smoothstep(0.1, 0.5, mirrorCoord.w) : 0.0;

	// Blend mirror reflection with sky color
	vec3 finalReflection = mix( skyReflection, reflectionSample, mirrorBlend );

	// Depth-based color: shallow water appears brighter/more transparent
	float depthFactor = smoothstep(0.0, maxVisibleDepth, vDepth);
	// Lighten water color in shallow areas for turquoise appearance
	vec3 depthBlendedColor = mix(waterColor * 2.5, waterColor, depthFactor);

	// Use depth-blended color for scatter
	vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * depthBlendedColor;
	vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ), ( vec3( 0.1 ) + finalReflection * 0.9 + finalReflection * specularLight ), reflectance);

	// Apply consistent tone mapping
	vec3 outgoingLight = FinalColorProcess(albedo);

	// Depth-based alpha: blend out completely as depth reaches 0 to prevent sawtoothing
	// Use a smoother fade near the edges for antialiasing
	float edgeFade = smoothstep(0.0, edgeFadeDistance, vDepth);
	float depthAlpha = mix(0.6, alpha, depthFactor) * edgeFade;
	
	// Distance-based edge smoothing to hide sawtooth artifacts at elevation
	// Use only camera distance to avoid tile-boundary artifacts
	// At large distances, water edges fade more smoothly regardless of LOD
	float distanceBasedSmoothing = smoothstep(100.0, 500.0, vCameraDistance); // Smooth from 100-500m away
	float smoothedEdgeFade = edgeFadeDistance * (1.0 + distanceBasedSmoothing * 8.0);
	
	// Apply distance-based edge fade
	// This hides the stair-stepping effect when viewed from elevation
	float distanceEdgeFade = smoothstep(0.0, smoothedEdgeFade, vDepth);
	depthAlpha *= distanceEdgeFade;
	
	gl_FragColor = vec4( outgoingLight, depthAlpha );

	#include <tonemapping_fragment>
}
