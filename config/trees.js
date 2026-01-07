/**
 * Tree Configuration
 * 
 * Configuration values for tree placement and rendering.
 */

export const TREE_CONFIG = {
	scale: { min: 1, max: 2 }, // Scale variation for trees
	slopeThreshold: 0.75, // Minimum terrain normal Y for tree placement (0-1)
	heightOffset: 0, // Vertical offset from terrain surface
	density: 0.18, // Probability of placing a tree at a valid location (0-1)
	gridSpacing: 8, // Spacing between potential tree positions (world units)
	maxTreesPerTile: 50, // Maximum trees per terrain tile
}
