/**
 * Seeded Random Number Generator Utility
 * 
 * Provides a deterministic pseudo-random number generator using the mulberry32 algorithm.
 * This implementation is fast, produces high-quality random numbers, and is consistent
 * across all uses in the codebase.
 */

/**
 * Creates a seeded random number generator function
 * Uses the mulberry32 algorithm for high-quality pseudo-random numbers
 * 
 * @param {number} seed - The seed value for the random number generator
 * @returns {function(): number} A function that returns random numbers between 0 and 1
 */
export const createSeededRandom = (seed) => {
	let state = seed
	return () => {
		state = (state + 0x6d2b79f5) | 0
		let t = Math.imul(state ^ (state >>> 15), state | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Hash function for generating consistent seeds from coordinates
 * Useful for procedural generation where you need deterministic randomness based on position
 * 
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} salt - Optional salt value for variation (default: 0)
 * @returns {number} A positive integer hash value
 */
export const hashCoords = (x, z, salt = 0) => {
	const h = (x * 374761393 + z * 668265263 + salt * 1013904223) | 0
	return Math.abs(h)
}
