uniform float uTime;
uniform sampler2D uFlowMap;
uniform vec3 uSkyColor;
uniform vec3 uSkyHorizonColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uDistortionScale;
uniform float uFlowSpeed;
uniform float uWaveSpeed;
uniform float uWaveScale;
uniform float uNormalStrength;
uniform float uOpacity;
uniform float uNearFade;
uniform float uFarFade;
// Shared atmosphere uniforms (from terrain/config.js)
uniform vec3 uFogExtinction;
uniform vec3 uFogInscatter;

varying vec3 vWorldPos;
varying vec3 vViewDirection;
varying float vViewDistance;
varying vec2 vFlowMapUV;

// Include shared atmosphere utilities
#include "./atmosphere.glsl"

// Hash constants for noise (from P_Malin)
#define MOD2 vec2(4.438975, 3.972973)

// Hash function for procedural noise
float Hash(float p) {
	vec2 p2 = fract(vec2(p) * MOD2);
	p2 += dot(p2.yx, p2.xy + 19.19);
	return fract(p2.x * p2.y);
}

// 2D hash for flow offset randomization
vec2 Hash2(float p) {
	vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 19.19);
	return fract((p3.xx + p3.yz) * p3.zy);
}

// Smooth noise with analytical derivatives (returns vec3: dx, dy, value)
vec3 SmoothNoise_DXY(vec2 o) {
	vec2 p = floor(o);
	vec2 f = fract(o);

	float n = p.x + p.y * 57.0;

	float a = Hash(n + 0.0);
	float b = Hash(n + 1.0);
	float c = Hash(n + 57.0);
	float d = Hash(n + 58.0);

	vec2 f2 = f * f;
	vec2 f3 = f2 * f;

	vec2 t = 3.0 * f2 - 2.0 * f3;
	vec2 dt = 6.0 * f - 6.0 * f2;

	float u = t.x;
	float v = t.y;
	float du = dt.x;
	float dv = dt.y;

	float res = a + (b - a) * u + (c - a) * v + (a - b + d - c) * u * v;

	float dx = (b - a) * du + (a - b + d - c) * du * v;
	float dy = (c - a) * dv + (a - b + d - c) * u * dv;

	return vec3(dx, dy, res);
}

// FBM with derivatives for water - flow affects each octave
const int k_fmbWaterSteps = 4;

vec3 FBM_DXY(vec2 p, vec2 flow, float ps, float df) {
	vec3 f = vec3(0.0);
	float tot = 0.0;
	float a = 1.0;

	for(int i = 0; i < k_fmbWaterSteps; i++) {
		p += flow;
		flow *= -0.75; // Negate and reduce flow for each octave - creates turbulence
		vec3 v = SmoothNoise_DXY(p);
		f += v * a;
		p += v.xy * df; // Domain warping based on gradient
		p *= 2.0;
		tot += a;
		a *= ps;
	}
	return f / tot;
}

// Geometry visibility function for specular (from reference)
float GIV(float dotNV, float k) {
	return 1.0 / ((dotNV + 0.0001) * (1.0 - k) + k);
}

// Wavelength-dependent water extinction (from reference)
// Red light is absorbed more than blue, creating natural depth coloring
vec3 GetWaterExtinction(float dist) {
	float fOpticalDepth = dist * 2.5;
	// Extinction coefficients - lower values = clearer water
	// Warmer tones to complement sandy terrain
	vec3 vExtinctCol = 1.0 - vec3(0.15, 0.12, 0.03);
	vec3 vExtinction = exp2(-fOpticalDepth * vExtinctCol);
	return vExtinction;
}

// Water-specific wrapper for GetSkyColour using our uniforms
vec3 WaterGetSkyColour(vec3 vRayDir) {
	return GetSkyColour(vRayDir, uSunDirection, uSkyColor, uSkyHorizonColor, uSunColor);
}

// Get environment color with gloss-based falloff (from reference)
vec3 GetEnvColour(vec3 vRayDir, float fGloss) {
	// Warm sandy undertone to match terrain
	vec3 floorColor = vec3(0.15, 0.12, 0.08);
	// Blend between sandy floor and sky color based on view direction
	return mix(floorColor, uSkyColor, clamp(vRayDir.y * (1.0 - fGloss * 0.4) * 0.6 + 0.5, 0.0, 1.0));
}

// Sample procedural water normal using FBM with flow
// Returns vec4: xyz = normal, w = height for foam calculation
vec4 SampleWaterNormal(vec2 vUV, vec2 vFlowOffset, float fMag, float fFoam) {
	// Scale for filtering based on screen-space derivatives
	vec2 vFilterWidth = max(abs(dFdx(vUV)), abs(dFdy(vUV)));
	float fFilterWidth = max(vFilterWidth.x, vFilterWidth.y);

	float fScale = 1.0 / (1.0 + fFilterWidth * fFilterWidth * 2000.0);

	// Gradient ascent - negative values make waves crest against flow
	float fGradientAscent = 0.25 + (fFoam * -1.5);

	// Get noise with derivatives
	vec3 dxy = FBM_DXY(vUV * 20.0, vFlowOffset * 20.0, 0.75 + fFoam * 0.25, fGradientAscent);

	// Flatten normal in foam areas
	fScale *= max(0.25, 1.0 - fFoam * 5.0);

	// Construct normal from derivatives
	vec3 vBlended = mix(vec3(0.0, 1.0, 0.0), normalize(vec3(dxy.x, fMag, dxy.y)), fScale);

	return vec4(normalize(vBlended), dxy.z * fScale);
}

// Sample foam texture using FBM
float SampleWaterFoam(vec2 vUV, vec2 vFlowOffset, float fFoam) {
	// Skip expensive FBM if foam amount is negligible
	if (fFoam < 0.01) return 1.0;
	float f = FBM_DXY(vUV * 30.0, vFlowOffset * 50.0, 0.8, -0.5).z;
	float fAmount = 0.2;
	f = max(0.0, (f - fAmount) / fAmount);
	return pow(0.5, f);
}

// Flowing normal with dual-phase crossfade to hide seams
vec4 SampleFlowingNormal(vec2 vUV, vec2 vFlowRate, float fFoam, float time, out float fOutFoamTex) {
	float fMag = 2.5 / (1.0 + dot(vFlowRate, vFlowRate) * 5.0);

	// Two time phases offset by 0.5
	float t0 = fract(time);
	float t1 = fract(time + 0.5);

	float i0 = floor(time);
	float i1 = floor(time + 0.5);

	// Phase offsets grow from -0.5 to +0.5
	float o0 = t0 - 0.5;
	float o1 = t1 - 0.5;

	// Offset UVs with random hash per phase to hide repetition
	vec2 vUV0 = vUV + Hash2(i0);
	vec2 vUV1 = vUV + Hash2(i1);

	// Sample at both phases
	vec4 sample0 = SampleWaterNormal(vUV0, vFlowRate * o0, fMag, fFoam);
	vec4 sample1 = SampleWaterNormal(vUV1, vFlowRate * o1, fMag, fFoam);

	// Crossfade weight
	float weight = abs(t0 - 0.5) * 2.0;

	// Sample foam at both phases (with early-out for low foam)
	float foam0 = SampleWaterFoam(vUV0, vFlowRate * o0 * 0.25, fFoam);
	float foam1 = SampleWaterFoam(vUV1, vFlowRate * o1 * 0.25, fFoam);

	vec4 result = mix(sample0, sample1, weight);
	result.xyz = normalize(result.xyz);

	fOutFoamTex = mix(foam0, foam1, weight);

	return result;
}

// Calculate flow rate and foam from flow map data (physics-based)
vec3 GetFlowRateAndFoam(vec2 flowDir, float flowStrength, float riverMask) {
	vec2 vFlow = flowDir * flowStrength * 2.0;

	// Calculate foam from flow turbulence
	float fFoamScale1 = 0.5;
	float fFoamCutoff = 0.4;

	float fFoam = abs(length(vFlow)) * fFoamScale1;
	fFoam += clamp(fFoam - fFoamCutoff, 0.0, 1.0);
	fFoam = clamp(fFoam, 0.0, 1.0) * riverMask;

	return vec3(vFlow * 0.6, fFoam);
}

// Fresnel with gloss factor (from reference)
vec3 GetFresnel(vec3 vView, vec3 vNormal, vec3 vR0, float fGloss) {
	float NdotV = max(0.0, dot(vView, vNormal));
	return vR0 + (vec3(1.0) - vR0) * pow(1.0 - NdotV, 5.0) * pow(fGloss, 20.0);
}

void main() {
	// Sample flow map (RG = direction, B = speed, A = river mask)
	vec4 flowData = texture2D(uFlowMap, vFlowMapUV);

	// Decode flow direction (0.5 = no flow, 0 = -1, 1 = +1)
	// Negate for visual flow - UV offset convention is opposite of physical flow
	vec2 flowDir = -((flowData.rg - 0.5) * 2.0);
	float flowStrength = flowData.b;
	float riverMask = flowData.a;

	// World position for UV calculations
	vec2 worldXZ = vWorldPos.xz;
	float time = uTime * uFlowSpeed;

	// Get physics-based flow and foam
	vec3 flowRateAndFoam = GetFlowRateAndFoam(flowDir, flowStrength, riverMask);
	vec2 vFlowRate = flowRateAndFoam.xy;
	float fFoam = flowRateAndFoam.z;

	// Scale and offset foam
	float fFoamScale = 1.5;
	float fFoamOffset = 0.2;
	fFoam = clamp((fFoam - fFoamOffset) * fFoamScale, 0.0, 1.0);
	fFoam = fFoam * fFoam * 0.5;

	// === SAMPLE FLOWING WATER NORMAL ===
	float fFoamTex = 1.0;
	vec4 waterNormalAndHeight = SampleFlowingNormal(worldXZ * uWaveScale, vFlowRate, fFoam, time, fFoamTex);
	vec3 normal = waterNormalAndHeight.xyz;

	// === OCEAN WAVES for non-river areas ===
	// Skip expensive ocean FBM calculation when fully in river
	if (riverMask < 0.99) {
		float oceanTime = uTime * uWaveSpeed;
		vec2 oceanFlow = vec2(oceanTime * 0.3, oceanTime * 0.2);
		vec3 oceanDxy = FBM_DXY(worldXZ * uWaveScale * 15.0, oceanFlow * 5.0, 0.6, 0.1);
		vec3 oceanNormal = normalize(vec3(oceanDxy.x, 3.0, oceanDxy.y));
		// Blend river and ocean based on river mask
		normal = mix(oceanNormal, normal, riverMask);
	}

	// === FOAM BLEND ===
	float fFoamBlend = 1.0 - pow(fFoamTex, fFoam * 5.0);
	float foam = fFoamBlend * riverMask;

	// Apply normal strength with distance-based falloff
	float distanceFalloff = 1.0 - smoothstep(100.0, 400.0, vViewDistance);
	float effectiveNormalStrength = uNormalStrength * (0.3 + 0.7 * distanceFalloff);

	// Scale the horizontal components for distortion
	vec3 worldNormal = normalize(vec3(normal.x * uDistortionScale * effectiveNormalStrength, normal.y, normal.z * uDistortionScale * effectiveNormalStrength));

	// View direction
	vec3 viewDir = normalize(vViewDirection);

	// === SIMULATE UNDERWATER DEPTH ===
	// Estimate depth based on view angle (steeper = deeper visible depth)
	float viewDotUp = max(abs(dot(viewDir, vec3(0.0, 1.0, 0.0))), 0.1);
	float estimatedDepth = 0.3 / viewDotUp; // Approximate underwater distance
	estimatedDepth = min(estimatedDepth, 2.0); // Clamp max depth

	// Add wave height variation to depth
	estimatedDepth *= 1.0 + waterNormalAndHeight.w * 0.5;

	// === WAVELENGTH-DEPENDENT EXTINCTION ===
	vec3 waterExtinction = GetWaterExtinction(estimatedDepth);

	// === REFRACTED/TRANSMITTED LIGHT ===
	// Simulate what we'd see underwater - warm sandy tones with sky blue tint
	vec3 underwaterColor = mix(vec3(0.5, 0.45, 0.35),  // Sandy warm base
	uSkyColor * 0.7,         // Sky blue tint
	0.4                       // Blend factor
	);

	// Calculate sun contribution underwater
	float NdotL = max(dot(worldNormal, uSunDirection), 0.0);
	float NdotV = max(dot(worldNormal, viewDir), 0.001);

	// Diffuse lighting on water surface for inscatter calculation
	vec3 vSurfaceDiffuse = uSunColor * NdotL * 0.4;
	vSurfaceDiffuse += uSkyColor * (worldNormal.y * 0.5 + 0.5) * 0.6; // More sky contribution

	// === INSCATTER (underwater light scattering) ===
	float fSunDotV = dot(uSunDirection, -viewDir);
	vec3 vInscatter = vSurfaceDiffuse * (1.0 - exp(-estimatedDepth * 0.5)) * (1.0 + fSunDotV * 0.5);

	// Combine transmitted light with inscatter and apply extinction
	vec3 vTransmitLight = underwaterColor + vInscatter;
	vTransmitLight *= waterExtinction;

	// Add foam to transmitted light (foam is opaque white)
	vec3 foamDiffuse = vSurfaceDiffuse * 0.8;
	vTransmitLight = mix(vTransmitLight, foamDiffuse, fFoamBlend);

	// === REFLECTION ===
	vec3 reflectDir = reflect(-viewDir, worldNormal);

	// Get reflected sky/environment color
	vec3 vReflectLight = WaterGetSkyColour(reflectDir);

	// Gloss-based blend between sharp reflection and diffuse environment
	float fGloss = 0.95 * (1.0 - fFoamBlend * 0.5); // Reduce gloss in foam
	vec3 envColor = GetEnvColour(reflectDir, fGloss);
	vReflectLight = mix(envColor, vReflectLight, pow(fGloss, 40.0));

	// === SPECULAR HIGHLIGHT (from reference) ===
	vec3 vH = normalize(viewDir + uSunDirection);
	float fNdotH = max(dot(worldNormal, vH), 0.0);

	// GGX-like distribution
	float alpha = 1.0 - fGloss;
	float alphaSqr = alpha * alpha;
	float denom = fNdotH * fNdotH * (alphaSqr - 1.0) + 1.0;
	float D = alphaSqr / (3.14159 * denom * denom);

	// Visibility term
	float k = alpha / 2.0;
	float vis = GIV(NdotL, k) * GIV(NdotV, k);

	float fSpecularIntensity = D * vis * NdotL;
	vec3 vSpecularLight = uSunColor * fSpecularIntensity;

	// Add specular to reflection
	vReflectLight += vSpecularLight;

	// === FRESNEL ===
	vec3 vR0 = vec3(0.02); // Water F0
	vec3 vFresnel = GetFresnel(viewDir, worldNormal, vR0, fGloss);

	// Reduce specular scale in foam areas
	float specScale = clamp(1.0 - fFoamBlend * 4.0, 0.0, 1.0);

	// === FINAL COLOR BLEND ===
	vec3 vResult = mix(vTransmitLight, vReflectLight, vFresnel * specScale);

	// === ATMOSPHERIC FOG ===
	// Atmospheric distance haze - blends distant water with sky color
	float fFogDistance = vViewDistance * 0.25; // Distance scale
	vec3 fogExtinction = vec3(0.03, 0.05, 0.05); // How fast water color fades
	vec3 fogInscatter = vec3(0.02, 0.018, 0.016); // How much sky color bleeds in
	vec3 vFogColour = WaterGetSkyColour(vec3(viewDir.x, max(viewDir.y, 0.0), viewDir.z));
	vResult = ApplyFog(vResult, fFogDistance, viewDir, vFogColour, fogExtinction, fogInscatter);

	// === FINAL COLOR PROCESSING (tonemapping + contrast) ===
	vResult = FinalColorProcess(vResult);

	// Distance-based opacity
	float distanceOpacity = mix(0.7, 1.0, smoothstep(uNearFade, uFarFade, vViewDistance));
	float finalOpacity = uOpacity * distanceOpacity;

	gl_FragColor = vec4(vResult, finalOpacity);
}
