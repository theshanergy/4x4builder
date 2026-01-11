import { createGrassMesh } from '../utils/vegetation/grassMesh'

export const TERRAIN_CONFIG = {
	// Deterministic seed for terrain generation
	seed: 1234,

	// Height Scaling
	baseHeightScale: 4,

	// Noise Scales
	continentScale: 0.00007,
	noiseScale: 0.04,
	mountainScale: 0.001,

	// Height Limits
	maxMountainHeight: 400,

	// Spawn Area - flat safe zone that transitions to natural terrain
	spawnRadius: 200,
	spawnTransitionRadius: 2500,

	// Terrain Layers
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
	],
}

export const VEGETATION_CONFIG = [
	{
		name: 'grass',
		meshFactory: createGrassMesh, // Use procedural grass mesh factory
		distance: {
			min: 1, // Start placing outside flat spawn area
			max: 100, // Match original viewDistance
		},
		scale: {
			min: 1.0,
			max: 1.2,
		},
		slope: {
			min: 0.0,
			max: 0.5, // Only on relatively flat areas (inverted from original 0.85 threshold)
		},
		height: {
			min: -1,
			max: 100,
		},
		density: 5000,
		maxLod: 1,
		collider: null, // No collider needed for grass
	},
]
