/**
 * Grassland Biome Configuration
 * 
 * A temperate grassland environment with rolling hills, green vegetation,
 * and moderate terrain features.
 */

import { Vector3, Color } from 'three'

export default {
	name: 'Grassland',
	description: 'Rolling hills with green grass and moderate terrain',

	// Environment configuration
	environment: {
		// Sun configuration
		sunDirection: new Vector3(0.545, 0.365, 0.4).normalize(),
		sunColor: new Color().setHSL(0.1, 1.0, 0.93), // Warm sun

		// Sky colors
		skyColorZenith: new Color().setHSL(0.58, 0.57, 0.59), // Deep blue at top
		skyColorHorizon: new Color().setHSL(0.58, 0.67, 0.85), // Pale blue-white at horizon
	},

	// Terrain configuration
	terrain: {
		// Height Scaling
		baseHeightScale: 4,

		// Noise Scales
		continentScale: 0.00007,
		noiseScale: 0.04,
		mountainScale: 0.001,

		// Height Limits
		maxMountainHeight: 400,

		// Spawn Protection
		spawnProtectionRadius: 400,
		spawnTransitionWidth: 300,

		// Spawn Area
		spawnFlatRadius: 16,
		spawnTransitionDistance: 2500,

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
				name: 'dirt',
				textures: {
					albedo: '/assets/images/ground/brown_mud_dry_diff_1k.jpg',
					normal: '/assets/images/ground/brown_mud_dry_nor_gl_1k.jpg',
				},
				textureScale: 0.6,
				normalScale: 1.0,
				height: {
					min: 30,
					max: 55,
					transitionMin: 30,
					transitionMax: 55,
					influence: 1.0,
				},
				slope: {
					max: 0.005,
					influence: 0.5,
					transition: 0.005,
				},
				lod: {
					distance: 70,
					levels: 4,
					scaleFactor: 3.5,
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
	},

	// Vegetation configuration
	vegetation: [
		{
			name: 'pine',
			model: '/assets/models/environment/pine_trees.glb',
			meshes: {
				lod0: 'SM_Pine01',
				lod1: 'SM_Pine01_lod1',
				lod2: 'SM_Pine01_lod2',
				lod3: 'SM_Pine01_lod3',
			},
			collider: {
				width: 0.3,
				height: 8.0,
				type: 'cylinder',
			},
			sphericalNormals: {
				lod3: true,
			},
			maxLod: 3,
			distance: {
				min: 0,
				max: 500,
			},
			scale: {
				min: 1.0,
				max: 2.0,
			},
			slope: {
				min: 0,
				max: 0.002,
			},
			height: {
				min: 10,
				max: 50,
			},
			density: 200,
		},
	],

	// Water configuration (appearance only)
	water: {
		// Water body configuration
		body: {
			maxDepth: 50,
		},

		// Per-tile water depth configuration
		depth: {
			shorelineDepthThreshold: 2.5,
			shallowDepthThreshold: 20.0,
			maxVisibleDepth: 8.0,
			edgeFadeDistance: 0.1,
			waterColor: [0.0, 0.12, 0.06],
		},
	},
}
