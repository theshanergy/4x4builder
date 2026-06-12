import { createGrassMesh } from '../utils/vegetation/grassMesh'
import { createPineMesh, createLeafyTreeMesh, createShrubMesh, createCactusMesh } from '../utils/vegetation/treeMeshes'

// Vegetation types, gated by the same deterministic climate fields that drive
// terrain materials (moisture / continentalness / mountain relief, see
// utils/terrain/climate.js). `density` is instances per square kilometer in a
// fully suitable cell; climate suitability scales it down smoothly toward
// biome borders. `slope` is 0 = flat, 1 = vertical.
//
// Streaming (see utils/vegetation/vegetationChunks.js):
// - `drawDistance` (m): hard streaming cutoff for the type.
// - `nearDistance` (m, optional): within it the detailed mesh (lod 0) renders
//   with shadows; beyond it the simplified mesh (lod 2) renders without.
const VEGETATION_CONFIG = [
	// Dry tan grass for the sandy deserts (the original look)
	{
		name: 'desert_grass',
		meshFactory: createGrassMesh,
		scale: { min: 1.0, max: 1.2 },
		slope: { min: 0.0, max: 0.5 },
		height: { min: -0.5, max: 120 },
		climate: {
			moisture: { max: 0.42, transition: 0.08 },
		},
		density: 5000,
		drawDistance: 240,
		collider: null,
	},
	// Lush green meadow grass for moist inland terrain
	{
		name: 'meadow_grass',
		meshFactory: () => createGrassMesh({ colorHex: '#5f8a38', bladeHeight: 0.34, bladeCount: 60 }),
		scale: { min: 1.0, max: 1.35 },
		slope: { min: 0.0, max: 0.5 },
		height: { min: 1, max: 270 },
		climate: {
			moisture: { min: 0.42, transition: 0.08 },
		},
		density: 9000,
		drawDistance: 240,
		collider: null,
	},
	// Montane pines — moist mid/high elevations up to the snowline
	{
		name: 'pine',
		meshFactory: createPineMesh,
		scale: { min: 0.7, max: 1.3 },
		slope: { min: 0.0, max: 0.45 },
		height: { min: 25, max: 285 },
		climate: {
			moisture: { min: 0.4, transition: 0.07 },
		},
		density: 1100,
		nearDistance: 320,
		drawDistance: 1500,
		collider: { type: 'cylinder', width: 0.3, height: 6 },
	},
	// Leafy trees — moist lowlands and foothills
	{
		name: 'leafy_tree',
		meshFactory: createLeafyTreeMesh,
		scale: { min: 0.7, max: 1.25 },
		slope: { min: 0.0, max: 0.4 },
		height: { min: 3, max: 150 },
		climate: {
			moisture: { min: 0.46, transition: 0.07 },
		},
		density: 450,
		nearDistance: 320,
		drawDistance: 1500,
		collider: { type: 'cylinder', width: 0.35, height: 4.5 },
	},
	// Hardy shrubs — everywhere below the snowline
	{
		name: 'shrub',
		meshFactory: createShrubMesh,
		scale: { min: 0.7, max: 1.4 },
		slope: { min: 0.0, max: 0.55 },
		height: { min: 1, max: 240 },
		density: 700,
		drawDistance: 560,
		collider: null,
	},
	// Saguaro cacti — hot dry lowlands only
	{
		name: 'cactus',
		meshFactory: createCactusMesh,
		scale: { min: 0.8, max: 1.5 },
		slope: { min: 0.0, max: 0.35 },
		height: { min: 2, max: 100 },
		climate: {
			moisture: { max: 0.3, transition: 0.06 },
		},
		density: 130,
		drawDistance: 560,
		collider: { type: 'cylinder', width: 0.22, height: 2.2 },
	},
]

export default VEGETATION_CONFIG
