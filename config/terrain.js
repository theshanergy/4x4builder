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
 * - name: Layer identifier
 * - textures: Paths to albedo and normal textures
 * - textureScale: World-space texture tiling scale
 * - blend: Blending configuration (not needed for base layer)
 *   - type: 'height', 'slope', or 'height_slope' (combined)
 *   - height: { start, end, influence } - Height-based blending
 *   - slope: { start, end, influence } - Slope-based blending (0=flat, 1=steep)
 *   - curvature: { scale, softness, ridgeInfluence } - Curvature-based erosion
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
		// Base layer - no blend config needed
		// Uses triplanar projection with LOD and stochastic sampling
		triplanar: true,
		stochastic: true, // Enable stochastic sampling to reduce tiling
		lod: {
			distanceScaleStart: 100,
			distanceScaleFactor: 300,
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
		blend: {
			type: 'height_slope',
			height: {
				start: 4, // Height where sand starts fading out
				end: 60, // Height where sand is fully gone
				influence: 0.8,
			},
			slope: {
				start: 0.1, // Slope threshold where sand starts fading
				end: 0.3, // Slope threshold where sand is fully gone
				influence: 0.9,
			},
			curvature: {
				scale: 50.0,
				softness: 0.3,
				ridgeInfluence: 0.5,
			},
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
		blend: {
			type: 'height_slope',
			height: {
				start: 120, // Height where snow starts appearing
				end: 200, // Height where snow is fully present
				influence: 1.0,
			},
			slope: {
				start: 0.5, // Snow fades on slopes steeper than this
				end: 0.8, // Snow fully gone on very steep slopes
				influence: 0.7,
			},
		},
		lod: {
			distanceScaleStart: 100,
			distanceScaleFactor: 300,
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
