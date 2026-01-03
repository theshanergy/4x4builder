// Water level constant
export const WATER_LEVEL = -1

// Ocean configuration
export const OCEAN_CONFIG = {
	radius: 5000,
	transition: 300, // Width of the beach transition zone
	depth: 12, // Depth below WATER_LEVEL
	// Beach profile control point (like a Bezier curve)
	beachMidpointDepth: 0.2, // Intermediate depth at transition midpoint (0-1 range)
}

// Helper for accessing ocean boundaries (computed once)
const OCEAN_BOUNDARY = OCEAN_CONFIG.radius + OCEAN_CONFIG.transition

// River configuration
export const RIVER_CONFIG = {
	// River path parameters - extends well into the ocean on both ends
	startX: -OCEAN_BOUNDARY,
	endX: OCEAN_BOUNDARY,
	baseZ: 0, // Center line of the river (middle of valley)

	// Meandering parameters
	primaryFrequency: 0.0015,
	primaryAmplitude: 180,
	secondaryFrequency: 0.006,
	secondaryAmplitude: 50,
	tertiaryFrequency: 0.02,
	tertiaryAmplitude: 15,

	// River dimensions
	width: 75, // Base width of river
	widthVariation: 15, // Random width variation
	depth: 2.5, // Depth below WATER_LEVEL
	bankSlope: 25, // Width of the sloped banks

	// Flow map texture configuration
	flowMap: {
		resolution: 512, // Texture resolution
		worldSize: 12000, // World area covered by the flow map (must cover full river extent)
	},
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
