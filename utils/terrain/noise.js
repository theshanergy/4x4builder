// Pure noise utility functions
// These functions wrap the noisejs library and provide reusable noise patterns

/**
 * Ridge noise function - creates sharp mountain ridges.
 * Uses absolute value of noise to create V-shaped valleys and ridges.
 * 
 * @param {Object} noise - Noise instance from noisejs
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate  
 * @param {number} scale - Noise frequency scale
 * @returns {number} Ridge noise value (0-1)
 */
export const getRidgeNoise = (noise, x, z, scale) => {
	const n = noise.perlin2(x * scale, z * scale)
	// Invert absolute value to get ridges instead of valleys
	return 1 - Math.abs(n)
}

/**
 * Get domain-warped coordinates for organic noise patterns.
 * Domain warping displaces sample positions for more natural, flowing shapes.
 * 
 * @param {Object} noise - Noise instance from noisejs
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} warpScale - Scale of the warping noise
 * @param {number} warpStrength - Amplitude of the warp displacement
 * @returns {Object} Warped coordinates {wx, wz}
 */
export const getDomainWarp = (noise, x, z, warpScale, warpStrength) => {
	const warpX = noise.perlin2(x * warpScale + 50, z * warpScale + 50) * warpStrength
	const warpZ = noise.perlin2(x * warpScale + 150, z * warpScale + 150) * warpStrength
	return {
		wx: x + warpX,
		wz: z + warpZ
	}
}

/**
 * Get layered Perlin noise (Fractal Brownian Motion).
 * Combines multiple octaves of noise for detailed terrain.
 * 
 * @param {Object} noise - Noise instance from noisejs
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} baseScale - Scale of the base layer
 * @param {Object} options - Optional parameters
 * @param {number} options.octaves - Number of noise layers (default: 3)
 * @param {number} options.lacunarity - Frequency multiplier per octave (default: 2.0)
 * @param {number} options.persistence - Amplitude multiplier per octave (default: 0.5)
 * @returns {number} Layered noise value
 */
export const getLayeredNoise = (noise, x, z, baseScale, options = {}) => {
	const { octaves = 3, lacunarity = 2.0, persistence = 0.5 } = options

	let result = 0
	let amplitude = 1
	let frequency = baseScale
	let maxValue = 0

	for (let i = 0; i < octaves; i++) {
		result += noise.perlin2(x * frequency, z * frequency) * amplitude
		maxValue += amplitude
		amplitude *= persistence
		frequency *= lacunarity
	}

	// Normalize to maintain consistent range
	return result / maxValue
}
