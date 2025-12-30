// Default Terrain Parameters
export const TERRAIN_CONFIG = {
	// Base terrain noise smoothness (higher = smoother, lower = more jagged)
	smoothness: 15,
	// Maximum terrain height
	maxHeight: 4,
	// Regional height modulation scale (size of flat/hilly regions)
	regionScale: 240,
}

// Staging Area Configuration (flat spawn area)
export const STAGING_AREA = {
	// Radius of completely flat area around origin
	flatRadius: 16,
	// Distance where terrain reaches full height (smooth blend zone)
	transitionEnd: 64,
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

// River configuration - carves a meandering channel through the valley
// Water component at Y=-1 fills the carved riverbed
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
}

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
