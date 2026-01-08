import { useMemo, useSyncExternalStore } from 'react'
import useGameStore from '../store/gameStore'
import { getBiome } from '../config/biomes'

/**
 * Biome subscription system for HMR support.
 * When biome files are hot-reloaded, we need to notify subscribers to re-render.
 */
let biomeVersion = 0
const listeners = new Set()

const subscribe = (callback) => {
	listeners.add(callback)
	return () => listeners.delete(callback)
}

const getSnapshot = () => biomeVersion

/**
 * Notify all subscribers that biome configs have changed.
 * Call this when biome files are hot-reloaded.
 */
export const invalidateBiomeCache = () => {
	biomeVersion++
	listeners.forEach((listener) => listener())
}

// Set up HMR for biome files
if (import.meta.hot) {
	import.meta.hot.accept('../config/biomes/index.js', () => {
		invalidateBiomeCache()
	})
	import.meta.hot.accept('../config/biomes/desert.js', () => {
		invalidateBiomeCache()
	})
	import.meta.hot.accept('../config/biomes/mountain.js', () => {
		invalidateBiomeCache()
	})
	import.meta.hot.accept('../config/biomes/winter.js', () => {
		invalidateBiomeCache()
	})
}

/**
 * Hook to get the current biome configuration.
 * Automatically updates when:
 * - The biome selection changes in the store
 * - Biome config files are hot-reloaded during development
 *
 * @returns {Object} The current biome configuration object
 */
export const useBiome = () => {
	const currentBiome = useGameStore((state) => state.currentBiome)

	// Subscribe to biome version for HMR updates
	useSyncExternalStore(subscribe, getSnapshot)

	// Get biome config - memoized on biome name + version
	return useMemo(() => getBiome(currentBiome), [currentBiome, biomeVersion])
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
