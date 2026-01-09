import { useMemo } from 'react'
import useGameStore from '../store/gameStore'
import { getBiome } from '../config/biomes'

/**
 * Hook to get the current biome configuration.
 * Automatically updates when the biome selection changes in the store.
 *
 * @returns {Object} The current biome configuration object
 */
export const useBiome = () => {
	const currentBiome = useGameStore((state) => state.currentBiome)

	// Get biome config - memoized on biome name
	return useMemo(() => getBiome(currentBiome), [currentBiome])
}

/**
 * Hook to get a specific sub-config from the current biome.
 * Use this for more granular subscriptions to minimize re-renders.
 *
 * @param {function} selector - Function that extracts the desired sub-config from the biome
 * @returns {*} The selected sub-config
 *
 * @example
 * // Only re-renders when environment config changes
 * const environment = useBiomeConfig(biome => biome.environment)
 */
export const useBiomeConfig = (selector) => {
	const biome = useBiome()
	return useMemo(() => selector(biome), [biome, selector])
}

/**
 * Hook to get environment configuration from the current biome.
 * @returns {Object} Environment config (sunDirection, sunColor, skyColors, etc.)
 */
export const useBiomeEnvironment = () => {
	const biome = useBiome()
	return biome.environment
}

/**
 * Hook to get terrain configuration from the current biome.
 * @returns {Object} Terrain config (heightScale, layers, etc.)
 */
export const useBiomeTerrain = () => {
	const biome = useBiome()
	return biome.terrain
}

/**
 * Hook to get vegetation configuration from the current biome.
 * @returns {Array} Vegetation types array
 */
export const useBiomeVegetation = () => {
	const biome = useBiome()
	return biome.vegetation
}

/**
 * Hook to get water configuration from the current biome.
 * @returns {Object} Water config (body, depth settings)
 */
export const useBiomeWater = () => {
	const biome = useBiome()
	return biome.water
}

export default useBiome
