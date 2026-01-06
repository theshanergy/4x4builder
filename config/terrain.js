// Unified Terrain Configuration
// Single config object controls all terrain generation parameters

export const TERRAIN_CONFIG = {
	// === Height Scaling ===
	// Final world height = normalized height × baseHeightScale
	baseHeightScale: 4,

	// === Noise Scales ===
	// Continental scale - very large features (land/water distribution)
	// Smaller values = larger features. 0.00007 ≈ 14,000 unit features
	continentScale: 0.00007,

	// Base terrain scale - medium rolling hills
	// 0.04 = hills roughly 25 units across
	noiseScale: 0.04,

	// Mountain scale - ridge and peak features
	// 0.001 = mountain features roughly 1000 units across
	mountainScale: 0.001,

	// === Height Limits ===
	// Maximum mountain height in world units
	maxMountainHeight: 400,

	// === Spawn Protection ===
	// Radius of guaranteed land around origin
	spawnProtectionRadius: 400,

	// Width of transition zone from protected to natural terrain
	spawnTransitionWidth: 300,

	// === Spawn Area (flat starting zone) ===
	// Radius of completely flat area around origin
	spawnFlatRadius: 16,

	// Distance where terrain reaches full height (smooth blend zone from flat area)
	spawnTransitionDistance: 2500,
}

/**
 * Terrain Layer Configuration
 *
 * Each layer defines:
 * - name: Layer identifier (used to match loaded textures)
 * - textures: Paths to albedo and normal textures
 * - textureScale: World-space texture tiling scale
 * - normalScale: Normal map intensity (optional, default 1.0)
 * - lod: LOD configuration { distance, levels }
 * - height: Height blending { min, max, influence } - all optional
 * - slope: Slope blending { min, max, influence, range } - all optional (0=flat, 1=steep)
 *
 * Layers are rendered bottom-to-top (first layer is base)
 */
export const TERRAIN_LAYERS = [
	{
		name: 'rock',
		textures: {
			albedo: '/assets/images/ground/dark_rough_rock_albedo.jpg',
			normal: '/assets/images/ground/dark_rough_rock_normal.jpg',
		},
		textureScale: 0.02,
		lod: {
			distance: 400,
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
			min: -1,
			max: 45,
			transitionMin: 3,
			transitionMax: 55,
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
		textureScale: 0.025,
		normalScale: 0.5,
		height: {
			min: 220,
			transitionMin: 55.0,
			influence: 1.0,
		},
		lod: {
			distance: 300,
			levels: 3,
		},
	},
]
