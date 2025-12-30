// Get sky color for a given view direction
// Blends from horizon color to zenith color based on elevation
// Adds sun glow contribution
vec3 GetSkyColour(vec3 vRayDir, vec3 vSunDir, vec3 vSkyColor, vec3 vSkyHorizonColor, vec3 vSunColor) {
	// Use power function for smoother gradient like old sky
	float elevation = max(0.0, vRayDir.y);
	float skyBlend = pow(elevation, 0.5);
	vec3 vSkyColour = mix(vSkyHorizonColor, vSkyColor, skyBlend);
	
	// Subtle sun glow near sun position (matching old approach)
	float fSunDotV = max(0.0, dot(vSunDir, vRayDir));
	float sunGlow = pow(fSunDotV, 8.0) * 0.3;
	vSkyColour += vSunColor * sunGlow * (1.0 - elevation * 0.5);
	
	// Very subtle horizon haze
	float horizonHaze = pow(1.0 - elevation, 12.0) * 0.15;
	vSkyColour = mix(vSkyColour, vec3(0.9, 0.92, 0.95), horizonHaze);
	
	return vSkyColour;
}

// Apply atmospheric fog based on distance
// Uses wavelength-dependent extinction and inscattering
vec3 ApplyFog(vec3 color, float distance, vec3 viewDir, vec3 fogColor, vec3 fogExtinction, vec3 fogInscatter) {
	vec3 vFogExtCol = exp2(fogExtinction * -distance);
	vec3 vFogInCol = exp2(fogInscatter * -distance);
	return color * vFogExtCol + fogColor * (1.0 - vFogInCol);
}

// Final color processing - simple tone mapping like old sky
// Apply after all lighting calculations, before output
vec3 FinalColorProcess(vec3 color) {
	// Light tone mapping - keep it bright and clean
	return pow(color, vec3(0.95));
}
