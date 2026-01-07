/**
 * Vegetation Configuration
 *
 * Configuration values for vegetation placement and rendering.
 * Similar to terrain layers, each vegetation type defines:
 * - name: Vegetation identifier
 * - model: Path to GLTF model file
 * - meshNames: Array of mesh names within the model for LOD levels (lod0, lod1, lod2, lod3)
 * - mesh: Optional specific mesh name within model (for multi-mesh models)
 * - scale: { min, max } - Random scale variation range
 * - slope: { min, max } - Slope range where vegetation can spawn (0=flat, 1=vertical)
 * - height: { min, max } - World height range where vegetation can spawn
 * - density: Probability of placing vegetation at a valid location (0-1)
 */

/**
 * Global vegetation settings
 */
export const VEGETATION_SETTINGS = {
	gridSpacing: 8, // Spacing between potential vegetation positions (world units)
}

/**
 * Vegetation Types Configuration
 * Each entry defines a type of vegetation that can be placed in the world.
 *
 * Placement:
 * - density: Probability (0-1) of placing vegetation at each grid position
 */
export const VEGETATION_TYPES = [
	{
		name: 'pine',
		model: '/assets/models/environment/pine_trees.glb',
		meshNames: ['SM_Pine01', 'SM_Pine01_lod1', 'SM_Pine01_lod2', 'SM_Pine01_lod3'],
		scale: {
			min: 1.0,
			max: 2.0,
		},
		slope: {
			min: 0, // Can spawn on flat ground
			max: 0.25, // Up to 25% slope (0.75 normal Y)
		},
		height: {
			min: 5, // Above water level
			max: 220, // Below snow line
		},
		density: 0.18, // Probability of placement at each grid position
	},
]
