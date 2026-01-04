// Default Terrain Parameters
export const TERRAIN_CONFIG = {
	// Base terrain noise smoothness (higher = smoother, lower = more jagged)
	smoothness: 25,
	// Height scale for base/valley terrain (mountains use their own scale)
	baseHeightScale: 4,
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

/**
 * Terrain Layer Configuration
 *
 * Each layer defines:
 * - name: Layer identifier (used to match loaded textures)
 * - textures: Paths to albedo and normal textures
 * - textureScale: World-space texture tiling scale
 * - normalScale: Normal map intensity (optional, default 1.0)
 * - triplanar: Use triplanar projection instead of world XZ (optional)
 * - stochastic: Use stochastic sampling to reduce tiling (optional)
 * - lod: LOD configuration { distance, levels }
 * - height: Height blending { min, max, influence } - all optional
 * - slope: Slope blending { min, max, influence, range } - all optional (0=flat, 1=steep)
 *
 * Omit any you don't need. Min/max within each are also optional:
 * - Only min: layer appears above that value
 * - Only max: layer appears below that value
 * - Both: layer appears within that range
 *
 * Layers are rendered bottom-to-top (first layer is base)
 */
export const TERRAIN_LAYERS = [
	{
		name: 'rock',
		textures: {
			albedo: '/assets/images/ground/slatecliffrock_albedo.jpg',
			normal: '/assets/images/ground/slatecliffrock_normal.jpg',
		},
		textureScale: 0.015,
		triplanar: true,
		stochastic: true,
		lod: {
			distance: 300,
			levels: 3,
		},
	},
	{
		name: 'sand',
		textures: {
			albedo: '/assets/images/ground/sand.jpg',
			normal: '/assets/images/ground/sand_normal.jpg',
		},
		textureScale: 0.4,
		normalScale: 0.5,
		height: {
			min: 0.0,
			max: 40,
			transitionMin: 1.5,
			transitionMax: 50.0,
			influence: 1.0,
		},
		slope: {
			max: 0.05,
			influence: 0.9,
			transition: 0.03,
		},
	},
	{
		name: 'snow',
		textures: {
			albedo: '/assets/images/ground/snow.jpg',
			normal: '/assets/images/ground/snow_normal.jpg',
		},
		textureScale: 0.05,
		normalScale: 0.5,
		height: {
			min: 180,
			transitionMin: 35.0,
			influence: 1.0,
		},
		lod: {
			distance: 300,
			levels: 3,
		},
	},
]

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
export const LOD_SPLIT_FACTOR = 2

// Hysteresis factor to prevent tile popping at LOD boundaries
// A node won't merge back until distance > nodeSize * LOD_SPLIT_FACTOR * LOD_HYSTERESIS
export const LOD_HYSTERESIS = 1.2
