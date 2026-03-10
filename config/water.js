// Sea level in game units (metres). Terrarium DEM tiles clamp ocean/lake
// surfaces to exactly this value — anything at or below is treated as water.
export const SEA_LEVEL = 0

// Water configuration
const WATER_CONFIG = {
	level: SEA_LEVEL,
	maxDepth: 50,
	shorelineDepthThreshold: 2.5,
	shallowDepthThreshold: 20.0,
	maxVisibleDepth: 8.0,
	edgeFadeDistance: 0.1,
	waterColor: '#001f0f',
}

export default WATER_CONFIG