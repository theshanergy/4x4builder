import { Vector3, Vector2 } from 'three'
import { WATER_LEVEL } from '../../config/water'

// Gerstner wave configuration
export const WAVES = [
	{ direction: 0, steepness: 0.15, wavelength: 100 },
	{ direction: 30, steepness: 0.15, wavelength: 50 },
	{ direction: 60, steepness: 0.15, wavelength: 25 },
]

// Pre-calculated wave parameters for shader uniforms
export const getWaveUniforms = () => {
	return {
		waveA: [Math.sin((WAVES[0].direction * Math.PI) / 180), Math.cos((WAVES[0].direction * Math.PI) / 180), WAVES[0].steepness, WAVES[0].wavelength],
		waveB: [Math.sin((WAVES[1].direction * Math.PI) / 180), Math.cos((WAVES[1].direction * Math.PI) / 180), WAVES[1].steepness, WAVES[1].wavelength],
		waveC: [Math.sin((WAVES[2].direction * Math.PI) / 180), Math.cos((WAVES[2].direction * Math.PI) / 180), WAVES[2].steepness, WAVES[2].wavelength],
	}
}

/**
 * Calculate Gerstner wave displacement and normal at a given position.
 * Used for buoyancy physics to make vehicles float on waves.
 *
 * @param {number} x - World X coordinate
 * @param {number} z - World Z coordinate
 * @param {number} time - Current animation time
 * @param {number} depth - Optional water depth for wave attenuation near shores
 * @returns {{ position: Vector3, normal: Vector3 }}
 */
export const getWaveInfo = (x, z, time, depth = Infinity) => {
	const pos = new Vector3()
	const tangent = new Vector3(1, 0, 0)
	const binormal = new Vector3(0, 0, 1)

	// Calculate wave scale based on depth (matches shader logic)
	let waveScale = 1.0
	if (depth < 3.0) {
		const shorelineThreshold = 0.5
		const shallowThreshold = 3.0
		waveScale = Math.max(0, Math.min(1, (depth - shorelineThreshold) / (shallowThreshold - shorelineThreshold)))
		// Apply cubic smoothstep for smoother transition
		waveScale = waveScale * waveScale * (3.0 - 2.0 * waveScale)
	}

	WAVES.forEach((w) => {
		const k = (Math.PI * 2.0) / w.wavelength
		const c = Math.sqrt(9.8 / k)
		const d = new Vector2(Math.sin((w.direction * Math.PI) / 180), -Math.cos((w.direction * Math.PI) / 180))
		const f = k * (d.dot(new Vector2(x, z)) - c * time)
		const steepness = w.steepness * waveScale
		const a = steepness / k

		pos.x += d.x * (a * Math.cos(f))
		pos.y += a * Math.sin(f)
		pos.z += d.y * (a * Math.cos(f))

		tangent.x += -d.x * d.x * (steepness * Math.sin(f))
		tangent.y += d.x * (steepness * Math.cos(f))
		tangent.z += -d.x * d.y * (steepness * Math.sin(f))

		binormal.x += -d.x * d.y * (steepness * Math.sin(f))
		binormal.y += d.y * (steepness * Math.cos(f))
		binormal.z += -d.y * d.y * (steepness * Math.sin(f))
	})

	const normal = binormal.cross(tangent).normalize()
	return { position: pos, normal: normal }
}

/**
 * Get the water surface height at a given position including wave displacement.
 *
 * @param {number} x - World X coordinate
 * @param {number} z - World Z coordinate
 * @param {number} time - Current animation time
 * @param {number} depth - Optional water depth for wave attenuation
 * @returns {number} Water surface Y coordinate
 */
export const getWaterHeight = (x, z, time, depth = Infinity) => {
	const waveInfo = getWaveInfo(x, z, time, depth)
	return WATER_LEVEL + waveInfo.position.y
}
