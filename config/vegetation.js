/**
 * Vegetation Configuration
 * 
 * Configuration values for vegetation placement and rendering.
 */

export const VEGETATION_CONFIG = {
	scale: { min: 1, max: 2 }, // Scale variation for vegetation
	slopeThreshold: 0.75, // Minimum terrain normal Y for vegetation placement (0-1)
	heightOffset: 0, // Vertical offset from terrain surface
	density: 0.18, // Probability of placing vegetation at a valid location (0-1)
	gridSpacing: 8, // Spacing between potential vegetation positions (world units)
	maxVegetationPerTile: 50, // Maximum vegetation per terrain tile
}
