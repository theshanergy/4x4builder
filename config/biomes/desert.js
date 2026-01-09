/**
 * Desert Biome Configuration
 *
 * A hot, arid environment with sandy terrain and minimal vegetation.
 */

import { Vector3, Color } from 'three'
import { createGrassMesh } from '../../utils/vegetation/grassMesh'

export default {
	name: 'Desert',
	description: 'A hot, arid environment with sandy terrain and minimal vegetation.',

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
	},

	// Vegetation configuration
	vegetation: [
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
	],

	// Water configuration (appearance only)
	water: {
		maxDepth: 50,
		shorelineDepthThreshold: 2.5,
		shallowDepthThreshold: 20.0,
		maxVisibleDepth: 8.0,
		edgeFadeDistance: 0.1,
		waterColor: [0.0, 0.12, 0.06],
	},
}
