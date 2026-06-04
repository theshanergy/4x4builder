export const terrainUsesRoadAttributes = (layers) =>
	layers.some((layer) => {
		const road = layer.road
		if (!road) return false
		return road.renderOnTerrain !== 'projected' && road.renderOnTerrain !== false
	})
