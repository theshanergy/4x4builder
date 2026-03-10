// Terrarium DEM reference elevation. Tiles encode ocean/lake surfaces at exactly
// this value — used as the baseline for synthetic depth and shore detection.
export const SEA_LEVEL = 0

// Visual water surface, slightly above SEA_LEVEL so Terrarium's flat ocean floor
// (reported as exactly 0) sits below the waterline without needing special-casing.
export const WATER_LEVEL = SEA_LEVEL + 0.25

// Water configuration
const WATER_CONFIG = {
	level: WATER_LEVEL,
	maxDepth: 50,
	shorelineDepthThreshold: 2.5,
	shallowDepthThreshold: 20.0,
	maxVisibleDepth: 8.0,
	edgeFadeDistance: 0.1,
	waterColor: '#001f0f',

	// Synthetic underwater depth generation
	// Replaces unreliable Terrarium underwater elevation with depth-from-shore.
	// A BFS distance transform finds the nearest shore vertex, then a smooth
	// falloff curve maps that distance to a plausible depth value.
	syntheticShoreThreshold: 5,    // Height (m) above water level treated as solid land for shore detection
	syntheticMaxDepth: 10,         // Maximum depth (m) reached far from shore
	syntheticFalloffDistance: 50, // Distance (m) over which depth ramps to max
	syntheticBlendThreshold: 30,   // Blend zone (m) near shore — depth fades to 0 to hide bad shoreline data
}

export default WATER_CONFIG