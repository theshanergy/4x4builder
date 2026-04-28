// Emergent rivers — derived from the erosion ridgemap produced by the
// phacelle-noise erosion in heightSampler.js. No parametric valleys: water
// appears wherever the eroded surface sits below WATER_CONFIG.level, and
// flow direction follows the ridgemap gradient downslope.

import TERRAIN_CONFIG from '../../config/terrain'

const { ridgeThreshold, ridgeBand, baseFlowSpeed, maxFlowSpeed, gradientEpsilon } = TERRAIN_CONFIG.river

// Flow strength: smoothstep ramp on how "channel-like" this point is.
// ridgeMap is ~negative in drainage channels. More negative = stronger flow.
const strengthFromRidge = (ridgeMap) => {
	// Map ridgeMap value onto [0,1] using -ridgeMap as the scalar.
	const r = -ridgeMap
	const t = (r - ridgeThreshold) / ridgeBand
	const c = t < 0 ? 0 : t > 1 ? 1 : t
	return c * c * (3 - 2 * c)
}

/**
 * Given a world position and the terrain sampler's `sample(x,z)` function,
 * compute emergent river flow at that point.
 *
 * Returns { direction: {x, z}, velocity, strength }.
 * - strength: 0 when not in a drainage channel, ramps to 1 in deep channels.
 * - direction: unit vector pointing downhill along the channel (gradient of
 *   the ridgemap, projected to XZ).
 * - velocity: m/s, scaled by local slope magnitude, capped.
 */
export const getFlowFromSample = (x, z, sample) => {
	const here = sample(x, z)
	const strength = strengthFromRidge(here.ridgeMap)
	if (strength <= 0) {
		return { direction: { x: 1, z: 0 }, velocity: 0, strength: 0 }
	}

	// Finite-difference gradient of ridgemap in world space.
	// Flow goes in the direction that decreases ridgemap (toward more negative = deeper channel).
	const e = gradientEpsilon
	const rL = sample(x - e, z).ridgeMap
	const rR = sample(x + e, z).ridgeMap
	const rD = sample(x, z - e).ridgeMap
	const rU = sample(x, z + e).ridgeMap
	const drdx = (rR - rL) / (2 * e)
	const drdz = (rU - rD) / (2 * e)

	// Flow along the surface: combine the ridgemap gradient (channel axis)
	// with the terrain slope (downhill bias). The ridgemap gradient alone
	// points toward deeper channel, which is *perpendicular* to flow;
	// rotating 90° and disambiguating with terrain slope gives flow direction.
	// Simpler and more robust: use terrain slope directly, since water flows
	// down the terrain regardless of channel shape.
	let fx = -here.slopeX
	let fz = -here.slopeZ
	const slopeMag = Math.sqrt(fx * fx + fz * fz)
	if (slopeMag < 1e-6) {
		// Effectively flat — fall back to the ridgemap gradient axis (channel direction).
		const gmag = Math.sqrt(drdx * drdx + drdz * drdz)
		if (gmag < 1e-6) {
			return { direction: { x: 1, z: 0 }, velocity: 0, strength }
		}
		// Rotate 90° so we travel along the channel rather than across it.
		fx = -drdz / gmag
		fz = drdx / gmag
		return {
			direction: { x: fx, z: fz },
			velocity: baseFlowSpeed * 0.25,
			strength,
		}
	}

	const dirX = fx / slopeMag
	const dirZ = fz / slopeMag

	// Velocity scales with slope (steeper channel = faster flow), capped.
	const velocity = Math.min(maxFlowSpeed, baseFlowSpeed + slopeMag * baseFlowSpeed * 2)

	return {
		direction: { x: dirX, z: dirZ },
		velocity,
		strength,
	}
}
