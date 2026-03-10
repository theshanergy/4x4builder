// Water configuration
const WATER_CONFIG = {
	level: 0,
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
	syntheticShoreThreshold: 2, // Height (m) above water level treated as solid land for shore detection
	syntheticMaxDepth: 10, // Maximum depth (m) reached far from shore
	syntheticFalloffDistance: 50, // Distance (m) over which depth ramps to max
}

export default WATER_CONFIG
