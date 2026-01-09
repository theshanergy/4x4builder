/**
 * Mountain Biome Configuration
 *
 * A cold, rugged environment with high elevations and sparse vegetation.
 */

import { Vector3, Color } from 'three'

export default {
	name: 'Mountain',
	description: 'A cold, rugged environment with high elevations and sparse vegetation.',

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
		// Deterministic seed for terrain generation
		seed: 5678,

		// Height Scaling - increased for more dramatic mountains
		baseHeightScale: 6,

		// Noise Scales - adjusted for more rugged terrain
		continentScale: 0.00007,
		noiseScale: 0.06,
		mountainScale: 0.001,

		// Height Limits - taller peaks
		maxMountainHeight: 600,

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
				name: 'grass',
				textures: {
					albedo: '/assets/images/ground/wispy-grass-meadow_albedo.jpg',
					normal: '/assets/images/ground/wispy-grass-meadow_normal.jpg',
				},
				textureScale: 0.5,
				normalScale: 1.0,
				height: {
					min: -1,
					max: 60,
					transitionMin: 3,
					transitionMax: 65,
					influence: 1.0,
				},
				slope: {
					max: 0.03,
					influence: 0.8,
					transition: 0.02,
				},
				lod: {
					distance: 100,
					levels: 3,
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
					min: 50,
					max: 150,
					transitionMin: 45,
					transitionMax: 155,
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
					min: 280,
					transitionMin: 150.0,
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
		// Large Pine Trees
		{
			name: 'pine_large',
			model: '/assets/models/environment/pine_trees.glb',
			meshes: {
				lod0: 'SM_Pine01',
				lod1: 'SM_Pine01_lod1',
				lod2: 'SM_Pine01_lod2',
				lod3: 'SM_Pine01_lod3',
			},
			collider: {
				width: 0.4,
				height: 10.0,
				type: 'cylinder',
			},
			sphericalNormals: {
				lod3: true,
			},
			maxLod: 3,
			distance: {
				min: 0,
				max: 600,
			},
			scale: {
				min: 1.2,
				max: 2.2,
			},
			slope: {
				min: 0,
				max: 0.003,
			},
			height: {
				min: 15,
				max: 180,
			},
			density: 150,
		},
		// Large Pine Trees 02
		{
			name: 'pine_large_02',
			model: '/assets/models/environment/pine_trees.glb',
			meshes: {
				lod0: 'SM_Pine02',
				lod1: 'SM_Pine02_lod1',
				lod2: 'SM_Pine02_lod2',
				lod3: 'SM_Pine02_lod3',
			},
			collider: {
				width: 0.4,
				height: 10.0,
				type: 'cylinder',
			},
			sphericalNormals: {
				lod3: true,
			},
			maxLod: 3,
			distance: {
				min: 0,
				max: 600,
			},
			scale: {
				min: 1.2,
				max: 2.2,
			},
			slope: {
				min: 0,
				max: 0.003,
			},
			height: {
				min: 15,
				max: 150,
			},
			density: 150,
		},
		// Dead Pine Trees (sparse)
		{
			name: 'pine_dead',
			model: '/assets/models/environment/pine_trees.glb',
			meshes: {
				lod0: 'SM_PineDead01',
				lod1: 'SM_PineDead01_lod1',
				lod2: 'SM_PineDead01_lod2',
				lod3: 'SM_PineDead01_lod3',
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
				max: 1.8,
			},
			slope: {
				min: 0,
				max: 0.003,
			},
			height: {
				min: 25,
				max: 170,
			},
			density: 60,
		},
		// Pine Medium Trees (higher elevation)
		{
			name: 'pine_medium',
			model: '/assets/models/environment/pine_trees.glb',
			meshes: {
				lod0: 'SM_PineMedium01',
				lod1: 'SM_PineMedium01_lod1',
				lod2: 'SM_PineMedium01_lod2',
				lod3: 'SM_PineMedium01_lod3',
			},
			collider: {
				width: 0.4,
				height: 9.0,
				type: 'cylinder',
			},
			sphericalNormals: {
				lod3: true,
			},
			maxLod: 3,
			distance: {
				min: 0,
				max: 550,
			},
			scale: {
				min: 1.0,
				max: 1.5,
			},
			slope: {
				min: 0,
				max: 0.004,
			},
			height: {
				min: 10,
				max: 180,
			},
			density: 80,
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
