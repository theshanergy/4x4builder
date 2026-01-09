/**
 * Winter Biome Configuration
 *
 * A cold, snowy winter environment with snow-covered terrain,
 * sparse vegetation, and a crisp blue-white atmosphere.
 */

import { Vector3, Color } from 'three'

export default {
	name: 'Winter',
	description: 'Snow-covered terrain with cold, crisp atmosphere',

	// Environment configuration
	environment: {
		// Sun configuration - cooler, lower angle sun for winter
		sunDirection: new Vector3(0.3, 0.25, 0.5).normalize(),
		sunColor: new Color().setHSL(0.55, 0.3, 0.95), // Cool, pale sun

		// Sky colors - cold winter sky
		skyColorZenith: new Color().setHSL(0.58, 0.4, 0.5), // Darker, muted blue at top
		skyColorHorizon: new Color().setHSL(0.55, 0.3, 0.92), // Pale gray-blue at horizon
	},

	// Terrain configuration
	terrain: {
		// Deterministic seed for terrain generation
		seed: 9012,

		// Height Scaling - slightly more dramatic mountains
		baseHeightScale: 4.5,

		// Noise Scales
		continentScale: 0.00007,
		noiseScale: 0.035, // Slightly smoother terrain
		mountainScale: 0.0008, // Larger mountain features

		// Height Limits
		maxMountainHeight: 500,

		// Spawn Area - flat safe zone that transitions to natural terrain
		spawnRadius: 200,
		spawnTransitionRadius: 2500,

		// Terrain Layers
		layers: [
			{
				name: 'snow',
				textures: {
					albedo: '/assets/images/ground/snow.jpg',
					normal: '/assets/images/ground/snow_normal.jpg',
				},
				textureScale: 0.03,
				normalScale: 0.8,
				lod: {
					distance: 200,
					levels: 4,
					scaleFactor: 3.0,
				},
			},
			{
				name: 'dunes',
				textures: {
					albedo: '/assets/images/ground/snow.jpg',
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
				lod: {
					distance: 350,
					levels: 4,
					scaleFactor: 5,
				},
			},
		],
	},

	// Vegetation configuration - sparse winter vegetation
	vegetation: [],

	// Water configuration (appearance only - colder, clearer water)
	water: {
		maxDepth: 50,
		shorelineDepthThreshold: 2.5,
		shallowDepthThreshold: 20.0,
		maxVisibleDepth: 12.0, // Clearer water
		edgeFadeDistance: 0.1,
		waterColor: [0.0, 0.05, 0.15], // Darker, colder blue
	},
}
