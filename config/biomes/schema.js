/**
 * Biome Configuration Schema
 *
 * This file defines the complete schema for biome configurations,
 * including type definitions, validation rules, and documentation.
 */

/**
 * @typedef {Object} BiomeEnvironment
 * @property {import('three').Vector3} sunDirection - Normalized direction vector for the sun
 * @property {import('three').Color} sunColor - Color of the sun light
 * @property {import('three').Color} skyColorZenith - Sky color at the zenith (top)
 * @property {import('three').Color} skyColorHorizon - Sky color at the horizon
 */

/**
 * @typedef {Object} TerrainLayerTextures
 * @property {string} albedo - Path to the albedo/diffuse texture
 * @property {string} normal - Path to the normal map texture
 */

/**
 * @typedef {Object} TerrainLayerHeight
 * @property {number} [min] - Minimum height for this layer (in world units)
 * @property {number} [max] - Maximum height for this layer (in world units)
 * @property {number} [transitionMin] - Height where transition begins (blend start)
 * @property {number} [transitionMax] - Height where transition ends (blend end)
 * @property {number} [influence] - Influence factor (0.0 to 1.0) for height-based blending
 */

/**
 * @typedef {Object} TerrainLayerSlope
 * @property {number} [min] - Minimum slope for this layer (0.0 = flat, 1.0 = vertical)
 * @property {number} [max] - Maximum slope for this layer
 * @property {number} [influence] - Influence factor (0.0 to 1.0) for slope-based blending
 * @property {number} [transition] - Transition range for slope blending
 */

/**
 * @typedef {Object} TerrainLayerLOD
 * @property {number} distance - Distance threshold for LOD transitions
 * @property {number} levels - Number of LOD levels
 * @property {number} [scaleFactor] - Scale factor for texture tiling at different LOD levels
 */

/**
 * @typedef {Object} TerrainLayer
 * @property {string} name - Unique identifier for the layer (e.g., 'rock', 'sand', 'snow')
 * @property {TerrainLayerTextures} textures - Texture paths for this layer
 * @property {number} textureScale - UV scale for texture tiling
 * @property {number} [normalScale] - Scale factor for normal map intensity (default: 1.0)
 * @property {TerrainLayerHeight} [height] - Height-based placement rules (optional)
 * @property {TerrainLayerSlope} [slope] - Slope-based placement rules (optional)
 * @property {TerrainLayerLOD} [lod] - LOD configuration for this layer (optional)
 */

/**
 * @typedef {Object} BiomeTerrain
 * @property {number} seed - Deterministic seed for terrain noise generation
 * @property {number} baseHeightScale - Base multiplier for terrain height
 * @property {number} continentScale - Scale factor for continent-level terrain features
 * @property {number} noiseScale - Scale factor for detail noise
 * @property {number} mountainScale - Scale factor for mountain features
 * @property {number} maxMountainHeight - Maximum height for mountains (in world units)
 * @property {number} spawnRadius - Radius of flat, safe spawn area (guaranteed land)
 * @property {number} spawnTransitionRadius - Distance over which spawn area transitions to natural terrain
 * @property {TerrainLayer[]} layers - Array of terrain layers, processed in order
 */

/**
 * @typedef {Object} VegetationMeshes
 * @property {string} lod0 - Mesh name for LOD 0 (highest detail)
 * @property {string} [lod1] - Mesh name for LOD 1
 * @property {string} [lod2] - Mesh name for LOD 2
 * @property {string} [lod3] - Mesh name for LOD 3 (lowest detail)
 */

/**
 * @typedef {Object} VegetationCollider
 * @property {number} width - Width/diameter of the collider
 * @property {number} height - Height of the collider
 * @property {'cylinder' | 'box' | 'sphere'} type - Type of collider geometry
 */

/**
 * @typedef {Object} VegetationSphericalNormals
 * @property {boolean} [lod0] - Use spherical normals for LOD 0
 * @property {boolean} [lod1] - Use spherical normals for LOD 1
 * @property {boolean} [lod2] - Use spherical normals for LOD 2
 * @property {boolean} [lod3] - Use spherical normals for LOD 3
 */

/**
 * @typedef {Object} VegetationDistance
 * @property {number} min - Minimum distance from spawn point
 * @property {number} max - Maximum distance from spawn point
 */

/**
 * @typedef {Object} VegetationScale
 * @property {number} min - Minimum scale multiplier
 * @property {number} max - Maximum scale multiplier
 */

/**
 * @typedef {Object} VegetationSlope
 * @property {number} min - Minimum terrain slope for placement
 * @property {number} max - Maximum terrain slope for placement
 */

/**
 * @typedef {Object} VegetationHeight
 * @property {number} min - Minimum terrain height for placement
 * @property {number} max - Maximum terrain height for placement
 */

/**
 * @typedef {Object} VegetationConfig
 * @property {string} name - Unique identifier for this vegetation type
 * @property {string} [model] - Path to the 3D model file (GLB/GLTF) - required if not using meshFactory
 * @property {Function} [meshFactory] - Factory function that returns {geometry, material} - required if not using model
 * @property {VegetationMeshes} [meshes] - Mesh names for different LOD levels (required for model-based vegetation)
 * @property {VegetationCollider} [collider] - Physics collider configuration (required for model-based vegetation)
 * @property {VegetationSphericalNormals} [sphericalNormals] - LOD levels using spherical normals
 * @property {number} maxLod - Maximum LOD level (0-3)
 * @property {VegetationDistance} distance - Distance constraints from spawn
 * @property {VegetationScale} scale - Scale randomization range
 * @property {VegetationSlope} slope - Slope constraints for placement
 * @property {VegetationHeight} height - Height constraints for placement
 * @property {number} density - Number of instances to attempt placing per unit area
 */

/**
 * @typedef {Object} BiomeWater
 * @property {number} maxDepth - Maximum depth of water bodies
 * @property {number} shorelineDepthThreshold - Depth threshold for shoreline detection
 * @property {number} shallowDepthThreshold - Depth threshold for shallow water
 * @property {number} maxVisibleDepth - Maximum visible depth for rendering
 * @property {number} edgeFadeDistance - Distance over which water edges fade
 * @property {number[]} waterColor - RGB color values for water (0.0 to 1.0)
 */

/**
 * @typedef {Object} BiomeConfig
 * @property {string} name - Display name of the biome
 * @property {string} description - Brief description of the biome
 * @property {BiomeEnvironment} environment - Environmental settings (sky, sun, etc.)
 * @property {BiomeTerrain} terrain - Terrain generation and appearance settings
 * @property {VegetationConfig[]} vegetation - Array of vegetation configurations
 * @property {BiomeWater} water - Water appearance settings
 */

/**
 * Validates a biome configuration object
 * @param {BiomeConfig} biome - The biome configuration to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateBiome(biome) {
	const errors = []

	// Check required top-level properties
	if (!biome.name) errors.push('Biome must have a name')
	if (!biome.description) errors.push('Biome must have a description')
	if (!biome.environment) errors.push('Biome must have environment configuration')
	if (!biome.terrain) errors.push('Biome must have terrain configuration')
	if (!Array.isArray(biome.vegetation)) errors.push('Biome must have vegetation array')
	if (!biome.water) errors.push('Biome must have water configuration')

	// Validate environment
	if (biome.environment) {
		if (!biome.environment.sunDirection) errors.push('Environment must have sunDirection')
		if (!biome.environment.sunColor) errors.push('Environment must have sunColor')
		if (!biome.environment.skyColorZenith) errors.push('Environment must have skyColorZenith')
		if (!biome.environment.skyColorHorizon) errors.push('Environment must have skyColorHorizon')
	}

	// Validate terrain
	if (biome.terrain) {
		const required = ['baseHeightScale', 'continentScale', 'noiseScale', 'mountainScale', 'maxMountainHeight', 'spawnRadius', 'spawnTransitionRadius', 'layers']
		required.forEach((prop) => {
			if (biome.terrain[prop] === undefined) {
				errors.push(`Terrain must have ${prop}`)
			}
		})

		// Validate terrain layers
		if (Array.isArray(biome.terrain.layers)) {
			biome.terrain.layers.forEach((layer, idx) => {
				if (!layer.name) errors.push(`Layer ${idx} must have a name`)
				if (!layer.textures) errors.push(`Layer ${idx} must have textures`)
				if (layer.textures && !layer.textures.albedo) errors.push(`Layer ${idx} must have albedo texture`)
				if (layer.textures && !layer.textures.normal) errors.push(`Layer ${idx} must have normal texture`)
				if (layer.textureScale === undefined) errors.push(`Layer ${idx} must have textureScale`)
			})
		}
	}

	// Validate vegetation
	if (Array.isArray(biome.vegetation)) {
		biome.vegetation.forEach((veg, idx) => {
			if (!veg.name) errors.push(`Vegetation ${idx} must have a name`)
			// Must have either model (GLTF) or meshFactory (mesh factory function)
			if (!veg.model && !veg.meshFactory) errors.push(`Vegetation ${idx} must have either a model path or meshFactory`)
			// Model-based vegetation requires meshes and collider
			if (veg.model && !veg.meshes) errors.push(`Vegetation ${idx} must have meshes`)
			if (veg.model && !veg.collider) errors.push(`Vegetation ${idx} must have collider`)
			if (!veg.distance) errors.push(`Vegetation ${idx} must have distance`)
			if (!veg.scale) errors.push(`Vegetation ${idx} must have scale`)
			if (!veg.slope) errors.push(`Vegetation ${idx} must have slope`)
			if (!veg.height) errors.push(`Vegetation ${idx} must have height`)
			if (veg.density === undefined) errors.push(`Vegetation ${idx} must have density`)
		})
	}

	// Validate water
	if (biome.water) {
		const waterRequired = ['maxDepth', 'shorelineDepthThreshold', 'shallowDepthThreshold', 'maxVisibleDepth', 'edgeFadeDistance', 'waterColor']
		waterRequired.forEach((prop) => {
			if (biome.water[prop] === undefined) {
				errors.push(`Water.${prop} is required`)
			}
		})
		// Validate waterColor is an array with 3 numbers
		if (Array.isArray(biome.water.waterColor)) {
			if (biome.water.waterColor.length !== 3) {
				errors.push(`Water.waterColor must have exactly 3 values (RGB)`)
			}
			biome.water.waterColor.forEach((val, idx) => {
				if (typeof val !== 'number' || val < 0 || val > 1) {
					errors.push(`Water.waterColor[${idx}] must be a number between 0 and 1`)
				}
			})
		}
	}

	return {
		valid: errors.length === 0,
		errors,
	}
}

/**
 * Creates a default biome configuration with all required fields
 * @param {string} name - Name of the biome
 * @returns {Promise<BiomeConfig>}
 */
export async function createDefaultBiome(name) {
	const { Vector3, Color } = await import('three')

	return {
		name: name || 'Unnamed Biome',
		description: 'A new biome configuration',
		environment: {
			sunDirection: new Vector3(0.545, 0.365, 0.4).normalize(),
			sunColor: new Color().setHSL(0.1, 1.0, 0.93),
			skyColorZenith: new Color().setHSL(0.58, 0.57, 0.59),
			skyColorHorizon: new Color().setHSL(0.58, 0.67, 0.85),
		},
		terrain: {
			baseHeightScale: 4,
			continentScale: 0.00007,
			noiseScale: 0.04,
			mountainScale: 0.001,
			maxMountainHeight: 400,
			spawnRadius: 200,
			spawnTransitionRadius: 2500,
			layers: [],
		},
		vegetation: [],
		water: {
			maxDepth: 50,
			shorelineDepthThreshold: 2.5,
			shallowDepthThreshold: 20.0,
			maxVisibleDepth: 8.0,
			edgeFadeDistance: 0.1,
			waterColor: [0.0, 0.12, 0.06],
		},
	}
}

/**
 * Schema constants for validation ranges
 */
export const SCHEMA_CONSTANTS = {
	// Terrain constraints
	MIN_HEIGHT_SCALE: 0.1,
	MAX_HEIGHT_SCALE: 100,
	MIN_SPAWN_RADIUS: 1,
	MAX_SPAWN_RADIUS: 10000,

	// Texture constraints
	MIN_TEXTURE_SCALE: 0.001,
	MAX_TEXTURE_SCALE: 100,
	MIN_NORMAL_SCALE: 0,
	MAX_NORMAL_SCALE: 5,

	// LOD constraints
	MIN_LOD_DISTANCE: 10,
	MAX_LOD_DISTANCE: 10000,
	MIN_LOD_LEVELS: 1,
	MAX_LOD_LEVELS: 5,

	// Vegetation constraints
	MIN_VEGETATION_DENSITY: 0,
	MAX_VEGETATION_DENSITY: 10000,
	MIN_SCALE: 0.01,
	MAX_SCALE: 100,
	MIN_SLOPE: 0,
	MAX_SLOPE: 1,

	// Water constraints
	MIN_WATER_DEPTH: 0,
	MAX_WATER_DEPTH: 1000,
	MIN_COLOR_VALUE: 0,
	MAX_COLOR_VALUE: 1,
}
