// Water level constant
export const WATER_LEVEL = -1

// Water body configuration (for procedural lakes/seas)
export const WATER_BODY_CONFIG = {
	// Maximum depth below WATER_LEVEL for deep water
	maxDepth: 50,
}

// Per-tile water depth configuration
export const WATER_DEPTH_CONFIG = {
	// Depth thresholds for wave modulation (in world units)
	shorelineDepthThreshold: 2.5, // Waves nearly flat below this depth
	shallowDepthThreshold: 20.0, // Full wave amplitude above this depth

	// Visual depth effects
	maxVisibleDepth: 8.0, // Depth at which water reaches full opacity/color
	edgeFadeDistance: 0.1, // Distance over which water fades to transparent at edges (prevents sawtoothing)
	waterColor: [0.0, 0.12, 0.06], // Base water color (RGB 0-1), appears lighter/turquoise in shallow areas
}

// Buoyancy configuration
export const BUOYANCY_CONFIG = {
	// Physics parameters
	floatFactor: 1.1, // Multiplier of gravity to determine max buoyancy (1.1 = slightly buoyant)
	drag: 4.0, // Linear drag coefficient (water resistance)
	angularDrag: 6.0, // Angular drag coefficient (rotational resistance)

	// Geometry parameters
	maxDepth: 1.1, // Depth for full buoyancy (approx vehicle height)
	buoyancyOffset: -0.1, // Offset behind center (negative Z) to make nose dip

	// Sinking parameters
	sinkingRate: 0.05, // How fast it fills with water (0-1 per second)
	minBuoyancy: 0.1, // Buoyancy factor when fully sunk (still has some displacement)

	// Flow parameters
	flowForce: 8.0, // Multiplier for flow force strength
}
