/**
 * Vegetation Configuration
 * 
 * Options:
 * - name: Unique identifier for the vegetation type
 * - model: Path to the GLB model file
 * - meshNames: Array of mesh names in the model (including LOD variants)
 * - scale: Random scale variation for instances
 *   - min: Minimum scale multiplier
 *   - max: Maximum scale multiplier
 * - slope: Terrain slope constraints (0 = flat, 1 = vertical)
 *   - min: Minimum allowed slope
 *   - max: Maximum allowed slope
 * - height: Elevation constraints in world units
 *   - min: Minimum spawn height
 *   - max: Maximum spawn height
 * - density: Spawn probability per 100 square meters (e.g., 0.01 = ~1 per 500 sq m)
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
		density: 0.01, // Items per 100 sq meters (~1 tree per 500 sq meters)
	},
]
