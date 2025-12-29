// Terrain Configuration Constants
// All terrain-related configuration values in one place.
// Modify these to adjust terrain appearance and behavior.

// Ocean configuration
export const OCEAN_RADIUS = 5000
export const OCEAN_TRANSITION = 300 // Width of the beach transition zone
export const OCEAN_DEPTH = 12 // How far below 0 the ocean floor goes

// Beach profile control point (like a Bezier curve)
export const BEACH_MIDPOINT_DEPTH = 0.2 // Intermediate depth at transition midpoint (0-1 range)

// River configuration - carves a meandering channel through the valley
// Water component at Y=-1 fills the carved riverbed
export const RIVER_CONFIG = {
	// River path parameters - extends to ocean on both ends
	startX: -OCEAN_RADIUS + 100,
	endX: OCEAN_RADIUS - 100,
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
	depth: 2.5, // How deep the river carves (must go below water level at Y=-1)
	bankSlope: 25, // Width of the sloped banks
}

// Mountain configuration
export const MOUNTAIN_CONFIG = {
	// Distance from origin where mountains start to appear
	startDistance: 1200,
	// Distance over which mountains blend in (transition zone)
	transitionWidth: 800,
	// Maximum mountain height
	maxHeight: 380,
	// Base noise scale for large mountain formations (smaller = more spread out)
	baseScale: 0.0006,
	// Ridge noise creates sharp mountain ridges (smaller = wider ridges)
	ridgeScale: 0.0015,
	// Detail noise for smaller features
	detailScale: 0.008,
	// Domain warping scale for more natural shapes
	warpScale: 0.0008,
	warpStrength: 200,
	// Valley carving - how much rivers/valleys cut into terrain
	valleyScale: 0.0012,
	valleyDepth: 0.5,
}

// Regional height modulation scale (size of flat/hilly regions)
export const REGION_SCALE = 240

// Epsilon for numerical gradient approximation
export const GRADIENT_EPSILON = 0.01

// Quadtree LOD Configuration

// Base size of the entire terrain quadtree (power of 2 recommended)
export const QUADTREE_ROOT_SIZE = 4096

// Minimum tile size (highest detail level) - also determines physics tile size
export const QUADTREE_MIN_SIZE = 32

// Resolution (vertices per side) for each tile regardless of size
// Higher = more detail per tile, but more geometry
export const TILE_RESOLUTION = 16

// LOD split threshold multiplier - a node splits when:
// distance < nodeSize * LOD_SPLIT_FACTOR
// Lower values = more aggressive LOD (less detail at distance)
// Higher values = more detail at distance (more tiles)
export const LOD_SPLIT_FACTOR = 1.5

// Hysteresis factor to prevent tile popping at LOD boundaries
// A node won't merge back until distance > nodeSize * LOD_SPLIT_FACTOR * LOD_HYSTERESIS
export const LOD_HYSTERESIS = 1.2

// Default Terrain Parameters
export const DEFAULT_TERRAIN_CONFIG = {
	smoothness: 15,
	maxHeight: 4,
}

// Water visibility thresholds
export const WATER_LOAD_DISTANCE = 1500 // Start loading water when this close to ocean edge
export const WATER_UNLOAD_BUFFER = 400 // Extra distance before unloading to prevent flicker
