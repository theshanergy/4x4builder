const TERRAIN_CONFIG = {
	// Deterministic seed for terrain generation
	seed: 1234,

	// World scaling — shader works in normalized [0,1] space.
	// worldScale: 1 shader unit = worldScale meters.
	// heightScale: shader-height 1.0 = heightScale meters.
	// heightOrigin: shader-height mapped to 0m in world.
	worldScale: 1000,
	heightScale: 400,
	heightOrigin: 0.36,

	// Spawn Area - flat safe zone that transitions to natural terrain
	spawnRadius: 600,

	// --- Base fractal height noise (pre-erosion) ---
	heightFrequency: 3.0,
	heightAmp: 0.125,
	heightOctaves: 3,
	heightLacunarity: 2.0,
	heightGain: 0.1,

	// --- Phacelle-noise erosion ---
	erosion: {
		scale: 0.15,
		strength: 0.22,
		gullyWeight: 0.5,
		detail: 1.5,
		ridgeRounding: 0.1,
		creaseRounding: 0.0,
		roundingInitMult: 0.1,
		roundingOctaveMult: 2.0,
		onsetInitial: 1.25,
		onsetOctave: 1.25,
		onsetRidgeInitial: 2.8,
		onsetRidgeOctave: 1.5,
		assumedSlopeValue: 0.7,
		assumedSlopeAmount: 1.0,
		cellScale: 0.7,
		normalization: 0.5,
		octaves: 5,
		lacunarity: 2.0,
		gain: 0.5,
		heightOffset: -0.65,
		heightOffsetPreserve: 0.0,
	},

	// Ocean boundary — terrain tapers off into the sea beyond this radius
	ocean: {
		// Distance from origin (meters) where land meets the ocean
		radius: 5000,
		// Width of the beach/falloff transition zone (meters)
		transition: 500,
		// How far below water level the ocean floor sinks (meters)
		depth: 30,
		// Normalized depth at the transition midpoint (0 = water surface, 1 = full ocean depth)
		// Controls the shape of the beach profile — lower = gentler initial slope
		beachMidpointDepth: 0.2,
	},

	// Terrain Layers (shader material)
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
				min: 0,
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
	],
}

export default TERRAIN_CONFIG
