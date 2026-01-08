/**
 * Biome Configuration System
 *
 * Each biome defines a complete set of environment, terrain, vegetation, and water settings.
 * Import individual biome modules and export them as a collection.
 */

import desert from './desert'
import mountain from './mountain'
import winter from './winter'

export const BIOMES = {
	desert,
	mountain,
	winter,
}

// Default biome
export const DEFAULT_BIOME = 'desert'

/**
 * Get biome configuration by name
 * @param {string} name - Biome identifier
 * @returns {Object} Biome configuration object
 */
export function getBiome(name) {
	return BIOMES[name] || BIOMES[DEFAULT_BIOME]
}

/**
 * Get list of available biomes for UI
 * @returns {Array} Array of biome metadata objects
 */
export function getBiomeList() {
	return Object.entries(BIOMES).map(([key, biome]) => ({
		id: key,
		name: biome.name,
		description: biome.description,
	}))
}
