export const terrainUsesRoadAttributes = (layers) =>
	layers.some((layer) => {
		const road = layer.road
		if (!road) return false
		return road.renderOnTerrain !== 'projected' && road.renderOnTerrain !== false
	})

// True when any layer (or any of its anyOf condition groups) blends on the
// climate fields, which requires the per-vertex `climate` attribute.
export const terrainUsesClimateAttributes = (layers) =>
	layers.some((layer) => {
		if (layer.climate) return true
		return Array.isArray(layer.anyOf) && layer.anyOf.some((group) => group.climate)
	})
