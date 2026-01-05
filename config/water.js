// Water level constant
export const WATER_LEVEL = -1

// Water body configuration (for procedural lakes/seas)
export const WATER_BODY_CONFIG = {
	// Maximum depth below WATER_LEVEL for deep water
	maxDepth: 15,
	// Shallow water depth near shores
	shallowDepth: 2,
	// Beach profile control - how steeply the shore drops off
	beachSteepness: 2.5,
}

// Per-tile water depth configuration
export const WATER_DEPTH_CONFIG = {
	// Depth thresholds for wave modulation (in world units)
	shorelineDepthThreshold: 0.5, // Waves nearly flat below this depth
	shallowDepthThreshold: 3.0, // Full wave amplitude above this depth

	// Visual depth effects
	maxVisibleDepth: 8.0, // Depth at which water reaches full opacity/color
	shallowWaterColor: [0.2, 0.6, 0.6], // Turquoise tint for shallow water (RGB 0-1)
}

// Flow map texture configuration (for water shader animation)
// Now covers a larger area for the infinite terrain
export const FLOW_MAP_CONFIG = {
	resolution: 512, // Texture resolution
	worldSize: 12000, // World area covered by the flow map
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
