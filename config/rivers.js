// River/Valley configuration - infinite valleys with rivers carved through them
// Valleys are spaced using noise for natural mountain separation
const RIVER_CONFIG = {
	// Valley spacing - controls distance between valley centers
	valleySpacing: 4000, // Average distance between valleys
	valleySpacingVariation: 0.3, // Noise-based variation (0-1, as fraction of spacing)

	// Meandering parameters for river within each valley
	primaryFrequency: 0.0015,
	primaryAmplitude: 180,
	secondaryFrequency: 0.006,
	secondaryAmplitude: 50,
	tertiaryAmplitude: 15,

	// River dimensions
	width: 75, // Base width of river
	widthVariation: 15, // Random width variation
	depth: 2.5, // Depth below WATER_LEVEL
	bankSlope: 25, // Width of the sloped banks
}

export default RIVER_CONFIG
