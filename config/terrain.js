/**
 * Terrain configuration.
 * Noise-based generation parameters have been removed — heights now come from
 * real-world elevation tiles (see config/geo.js and ElevationProvider).
 *
 * This file retains the texture layer definitions used by useTerrainMaterial
 * to blend surface types by height and slope.  Thresholds are in metres and
 * calibrated for real-world elevation ranges (e.g. Moab ~1200–2700 m asl,
 * Alps up to ~4800 m asl).
 */
const TERRAIN_CONFIG = {
	// Terrain Layers — blended by height (metres asl) and surface slope
	layers: [
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
				// Sand appears at low elevations near sea level
				min: -20,
				max: 100,
				transitionMin: 5,
				transitionMax: 120,
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
				// Snow line at ~2500 m — appropriate for mid-latitude mountains
				min: 2500,
				transitionMin: 400,
				influence: 1.0,
			},
			lod: {
				distance: 300,
				levels: 3,
			},
		},
	],
}

export default TERRAIN_CONFIG
