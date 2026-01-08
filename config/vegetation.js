/**
 * Vegetation Configuration
 *
 * Options:
 * - name: Unique identifier for the vegetation type
 * - model: Path to the GLB model file
 * - meshes: Object with LOD level mesh names (lod0, lod1, lod2, lod3)
 *   - If a level is not provided, the next highest LOD is used by default
 * - scale: Random scale variation for instances
 *   - min: Minimum scale multiplier
 *   - max: Maximum scale multiplier
 * - slope: Terrain slope constraints (0 = flat, 1 = vertical)
 *   - min: Minimum allowed slope
 *   - max: Maximum allowed slope
 * - height: Elevation constraints in world units
 *   - min: Minimum spawn height
 *   - max: Maximum spawn height
 * - maxLod: Optional maximum LOD level (0-3) at which this vegetation renders
 *   - If not specified, renders at all LOD levels
 *   - Example: maxLod: 2 means only renders at LOD 0, 1, and 2 (not at LOD 3)
 * - density: Spawn probability per 100 square meters (e.g., 0.01 = ~1 per 500 sq m)
 */
export const VEGETATION_TYPES = [
	{
		name: 'pine',
		model: '/assets/models/environment/pine_trees.glb',
		meshes: {
			lod0: 'SM_Pine01',
			lod1: 'SM_Pine01_lod1',
			lod2: 'SM_Pine01_lod2',
			lod3: 'SM_Pine01_lod3',
		},
		maxLod: 3, // Don't render at lowest detail LOD
		distance: {
			min: 0,
			max: 500,
		},
		scale: {
			min: 1.0,
			max: 2.0,
		},
		slope: {
			min: 0, // Can spawn on flat ground
			max: 0.25, // Up to 25% slope (0.75 normal Y)
		},
		height: {
			min: 0, // Above water level
			max: 60,
		},
		density: 0.1, // Items per 100 sq meters (~1 tree per 500 sq meters)
	},
]
