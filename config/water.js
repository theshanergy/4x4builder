// Water level constant (does not vary by biome)
export const WATER_LEVEL = -1

// Buoyancy configuration (does not vary by biome)
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
