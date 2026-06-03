import { CatmullRomCurve3, Vector3 } from 'three'

import { createSeededRandom } from '../seededRandom'

const NO_SURFACE = Object.freeze({
	type: null,
	weightIndex: -1,
	heightInfluence: 0,
	materialWeight: 0,
	vegetationClearance: 0,
	distanceAlong: 0,
	lateralOffset: 0,
	halfWidth: 0,
})

const CHANNEL_COUNT = 4
const DEFAULT_SPATIAL_CELL_SIZE = 96
const DEFAULT_SAMPLE_SPACING = 12

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value)
const clamp01 = (value) => clamp(value, 0, 1)
const mix = (a, b, t) => a + (b - a) * t
const smoothstep = (edge0, edge1, x) => {
	if (edge0 === edge1) return x < edge0 ? 0 : 1
	const t = clamp01((x - edge0) / (edge1 - edge0))
	return t * t * (3 - 2 * t)
}

const hashString = (value) => {
	let hash = 2166136261
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	return hash >>> 0
}

const cellKey = (x, z) => `${x}:${z}`

const estimateControlLength = (points) => {
	let length = 0
	for (let i = 1; i < points.length; i++) {
		const dx = points[i].x - points[i - 1].x
		const dz = points[i].z - points[i - 1].z
		length += Math.sqrt(dx * dx + dz * dz)
	}
	return length
}

const smoothHeights = (heights, sampleSpacing, smoothingDistance, blendAmount) => {
	if (!smoothingDistance || !blendAmount) return heights.slice()

	const radius = Math.max(1, Math.round(smoothingDistance / sampleSpacing))
	const smoothed = new Array(heights.length)

	for (let i = 0; i < heights.length; i++) {
		let sum = 0
		let weightSum = 0
		const min = Math.max(0, i - radius)
		const max = Math.min(heights.length - 1, i + radius)

		for (let j = min; j <= max; j++) {
			const normalizedDistance = Math.abs(i - j) / radius
			const weight = 1 - normalizedDistance * normalizedDistance
			sum += heights[j] * weight
			weightSum += weight
		}

		const averaged = weightSum > 0 ? sum / weightSum : heights[i]
		smoothed[i] = mix(heights[i], averaged, blendAmount)
	}

	return smoothed
}

const bridgeLowSpots = (heights, sampleSpacing, options) => {
	const emptyBridgeRaise = new Array(heights.length).fill(0)
	if (!options?.enabled) {
		return {
			heights: heights.slice(),
			bridgeRaise: emptyBridgeRaise,
		}
	}

	const minRadius = Math.max(1, Math.round(((options.minSpan ?? 20) * 0.5) / sampleSpacing))
	const maxRadius = Math.max(minRadius, Math.round(((options.maxSpan ?? 80) * 0.5) / sampleSpacing))
	const maxRaise = options.maxRaise ?? 1.2
	const minRaise = options.minRaise ?? 0.12
	const strength = clamp01(options.strength ?? 0.65)
	const clearance = options.clearance ?? 0.08
	const bridged = heights.slice()

	for (let i = 0; i < heights.length; i++) {
		let bestRaise = 0

		for (let radius = minRadius; radius <= maxRadius; radius++) {
			const left = i - radius
			const right = i + radius
			if (left < 0 || right >= heights.length) continue

			const bridgeHeight = (heights[left] + heights[right]) * 0.5 - clearance
			const raise = bridgeHeight - heights[i]
			if (raise > bestRaise) bestRaise = raise
		}

		if (bestRaise > minRaise) {
			bridged[i] = heights[i] + Math.min(bestRaise, maxRaise) * strength
		}
	}

	const smoothed = smoothHeights(bridged, sampleSpacing, options.smoothingDistance ?? 24, options.smoothingStrength ?? 0.35)
	const bridgeRaise = smoothed.map((height, index) => Math.max(0, height - heights[index]))

	return {
		heights: smoothed,
		bridgeRaise,
	}
}

const jitterControlPoints = (route, seed) => {
	const random = createSeededRandom(hashString(`${seed}:${route.id}:${route.type}`))
	const jitter = route.jitter ?? 0
	const endpointJitter = route.endpointJitter ?? 0
	const fixedIndices = new Set(route.fixedControlPointIndices ?? [])
	const points = route.controlPoints.map(([x, z], index) => {
		const isEndpoint = index === 0 || index === route.controlPoints.length - 1
		if (fixedIndices.has(index)) return new Vector3(x, 0, z)

		const pointJitter = isEndpoint ? endpointJitter : jitter
		if (pointJitter <= 0) return new Vector3(x, 0, z)

		return new Vector3(x + (random() - 0.5) * pointJitter, 0, z + (random() - 0.5) * pointJitter)
	})

	return points
}

const getDistanceSq = (a, b) => {
	const dx = a.x - b.x
	const dz = a.z - b.z
	return dx * dx + dz * dz
}

const getHorizontalDistance = (a, b) => Math.sqrt(getDistanceSq(a, b))

const getTopographyCost = (candidate, prev, next, normalX, normalZ, tangentX, tangentZ, original, topography, sampleBase) => {
	const sample = sampleBase(candidate.x, candidate.z)
	const prevSample = sampleBase(prev.x, prev.z)
	const nextSample = sampleBase(next.x, next.z)
	const prevDistance = Math.max(1, getHorizontalDistance(candidate, prev))
	const nextDistance = Math.max(1, getHorizontalDistance(candidate, next))
	const gradeIn = Math.abs(sample.height - prevSample.height) / prevDistance
	const gradeOut = Math.abs(nextSample.height - sample.height) / nextDistance
	const slopeAlong = Math.abs(sample.slopeX * tangentX + sample.slopeZ * tangentZ)
	const slopeAcross = Math.abs(sample.slopeX * normalX + sample.slopeZ * normalZ)
	const displacement = Math.sqrt(getDistanceSq(candidate, original)) / Math.max(1, topography.maxOffset ?? 1)

	return (
		(gradeIn + gradeOut) * (topography.gradeWeight ?? 6) +
		slopeAlong * (topography.alongSlopeWeight ?? 4) +
		slopeAcross * (topography.crossSlopeWeight ?? 0.4) +
		displacement * displacement * (topography.displacementWeight ?? 0.45)
	)
}

const relaxControlPointsToTopography = (points, route, sampleBase) => {
	const topography = route.topography
	if (!topography?.enabled || points.length < 4) return points

	const relaxed = points.map((point) => point.clone())
	const original = points.map((point) => point.clone())
	const fixedIndices = new Set(route.fixedControlPointIndices ?? [])
	const iterations = topography.iterations ?? 2
	const sampleStep = topography.sampleStep ?? 80
	const sampleCount = Math.max(1, topography.sampleCount ?? 3)
	const strength = clamp01(topography.strength ?? 0.65)
	const maxOffset = topography.maxOffset ?? sampleStep * sampleCount

	for (let iteration = 0; iteration < iterations; iteration++) {
		for (let i = 1; i < relaxed.length - 1; i++) {
			if (fixedIndices.has(i)) continue

			const prev = relaxed[i - 1]
			const current = relaxed[i]
			const next = relaxed[i + 1]
			const tangentXRaw = next.x - prev.x
			const tangentZRaw = next.z - prev.z
			const tangentLength = Math.sqrt(tangentXRaw * tangentXRaw + tangentZRaw * tangentZRaw)
			if (tangentLength < 1e-6) continue

			const tangentX = tangentXRaw / tangentLength
			const tangentZ = tangentZRaw / tangentLength
			const normalX = -tangentZ
			const normalZ = tangentX
			let bestPoint = current
			let bestCost = getTopographyCost(current, prev, next, normalX, normalZ, tangentX, tangentZ, original[i], topography, sampleBase)

			for (let sampleIndex = -sampleCount; sampleIndex <= sampleCount; sampleIndex++) {
				if (sampleIndex === 0) continue

				const candidate = new Vector3(current.x + normalX * sampleStep * sampleIndex, 0, current.z + normalZ * sampleStep * sampleIndex)
				const fromOriginalX = candidate.x - original[i].x
				const fromOriginalZ = candidate.z - original[i].z
				const fromOriginalLength = Math.sqrt(fromOriginalX * fromOriginalX + fromOriginalZ * fromOriginalZ)

				if (fromOriginalLength > maxOffset) {
					const scale = maxOffset / fromOriginalLength
					candidate.x = original[i].x + fromOriginalX * scale
					candidate.z = original[i].z + fromOriginalZ * scale
				}

				const cost = getTopographyCost(candidate, prev, next, normalX, normalZ, tangentX, tangentZ, original[i], topography, sampleBase)
				if (cost < bestCost) {
					bestCost = cost
					bestPoint = candidate
				}
			}

			current.x = mix(current.x, bestPoint.x, strength)
			current.z = mix(current.z, bestPoint.z, strength)
		}
	}

	return relaxed
}

const buildRoutePoints = (route, typeConfig, config, sampleBase) => {
	const sampleSpacing = config.sampleSpacing ?? DEFAULT_SAMPLE_SPACING
	const points = relaxControlPointsToTopography(jitterControlPoints(route, config.seed ?? 0), route, sampleBase)
	const curve = new CatmullRomCurve3(points, Boolean(route.closed), route.curveType ?? 'centripetal', route.tension ?? 0.5)
	const estimatedLength = estimateControlLength(points)
	curve.arcLengthDivisions = Math.max(64, Math.ceil(estimatedLength / sampleSpacing) * 4)
	curve.updateArcLengths()

	const curveLength = Math.max(curve.getLength(), sampleSpacing)
	const divisions = Math.max(4, Math.ceil(curveLength / sampleSpacing))
	const sampled = curve.getSpacedPoints(divisions)
	const baseHeights = sampled.map((point) => sampleBase(point.x, point.z).height)
	const smoothedHeights = smoothHeights(baseHeights, sampleSpacing, typeConfig.heightSmoothing ?? 0, typeConfig.gradeSmoothing ?? 0)
	const bridgeResult = bridgeLowSpots(smoothedHeights, sampleSpacing, typeConfig.bridgeLowSpots)
	const roadHeights = bridgeResult.heights
	const heightOffset = typeConfig.heightOffset ?? 0
	const bridgeOptions = typeConfig.bridgeLowSpots
	const fillMultiplier = bridgeOptions?.fillMultiplier ?? 1.1
	const extraFill = bridgeOptions?.extraFill ?? 0.25

	return sampled.map((point, index) => ({
		x: point.x,
		z: point.z,
		height: roadHeights[index] + heightOffset,
		bridgeRaise: bridgeResult.bridgeRaise[index],
		fillAllowance: Math.max(0, roadHeights[index] + heightOffset - baseHeights[index]) * fillMultiplier + extraFill,
	}))
}

const getProfileOffset = (typeConfig, lateralOffset, halfWidth) => {
	const absLateral = Math.abs(lateralOffset)
	let offset = 0

	if (typeConfig.crownHeight) {
		offset += typeConfig.crownHeight * (1 - smoothstep(0, halfWidth, absLateral))
	}

	if (typeConfig.crossfall) {
		offset -= absLateral * typeConfig.crossfall
	}

	if (typeConfig.rutDepth && typeConfig.laneOffset && typeConfig.rutWidth) {
		const laneDistance = Math.abs(absLateral - typeConfig.laneOffset)
		const rutMask = 1 - smoothstep(typeConfig.rutWidth, typeConfig.rutWidth + (typeConfig.rutFeather ?? typeConfig.rutWidth), laneDistance)
		offset -= typeConfig.rutDepth * rutMask
	}

	return offset
}

const createSegments = (routes, config, sampleBase) => {
	const segments = []
	const types = config.types ?? {}
	const sampleSpacing = config.sampleSpacing ?? DEFAULT_SAMPLE_SPACING

	for (const route of routes) {
		const typeConfig = types[route.type]
		if (!typeConfig) continue

		const routePoints = buildRoutePoints(route, typeConfig, config, sampleBase)
		let distanceAlong = 0

		for (let i = 1; i < routePoints.length; i++) {
			const a = routePoints[i - 1]
			const b = routePoints[i]
			const dx = b.x - a.x
			const dz = b.z - a.z
			const lengthSq = dx * dx + dz * dz
			if (lengthSq < 1e-6) continue

			const length = Math.sqrt(lengthSq)
			const halfWidth = typeConfig.width * 0.5
			const shoulderWidth = typeConfig.shoulderWidth ?? 0
			const bridgeOptions = typeConfig.bridgeLowSpots
			const fillAllowance = Math.max(a.fillAllowance ?? 0, b.fillAllowance ?? 0)
			const shoulderStartFill = bridgeOptions?.shoulderStartFill ?? 1.5
			const bridgeShoulderWidth = Math.min(
				bridgeOptions?.maxShoulderWidth ?? 36,
				Math.max(0, fillAllowance - shoulderStartFill) * (bridgeOptions?.shoulderWidthPerFillMeter ?? 1.15)
			)
			const influenceRadius = halfWidth + shoulderWidth + bridgeShoulderWidth

			segments.push({
				routeId: route.id,
				type: route.type,
				weightIndex: clamp(typeConfig.weightIndex ?? 0, 0, CHANNEL_COUNT - 1),
				priority: typeConfig.priority ?? 0,
				ax: a.x,
				az: a.z,
				bx: b.x,
				bz: b.z,
				dx,
				dz,
				dirX: dx / length,
				dirZ: dz / length,
				length,
				lengthSq,
				distanceStart: distanceAlong,
				heightA: a.height,
				heightB: b.height,
				bridgeRaiseA: a.bridgeRaise,
				bridgeRaiseB: b.bridgeRaise,
				fillAllowanceA: a.fillAllowance,
				fillAllowanceB: b.fillAllowance,
				bridgeShoulderWidth,
				halfWidth,
				influenceRadius,
				influenceRadiusSq: influenceRadius * influenceRadius,
				edgeFeather: typeConfig.edgeFeather ?? Math.max(0.5, sampleSpacing * 0.2),
				carveStrength: typeConfig.carveStrength ?? 1,
				maxCut: typeConfig.maxCut ?? 8,
				maxFill: typeConfig.maxFill ?? 2,
				vegetationClearanceWidth: typeConfig.vegetationClearanceWidth ?? influenceRadius,
				typeConfig,
			})

			distanceAlong += length
		}
	}

	return segments
}

export const createRoadVisualRoutes = (config, sampleBase) => {
	if (!config?.enabled || !config.routes?.length) return []

	const types = config.types ?? {}

	return config.routes
		.map((route) => {
			const typeConfig = types[route.type]
			if (!typeConfig) return null

			const edgeFeather = typeConfig.edgeFeather ?? Math.max(0.5, (config.sampleSpacing ?? DEFAULT_SAMPLE_SPACING) * 0.2)
			const halfWidth = typeConfig.width * 0.5
			const routePoints = buildRoutePoints(route, typeConfig, config, sampleBase)
			let distanceAlong = 0

			const samples = routePoints.map((point, index) => {
				if (index > 0) {
					const prev = routePoints[index - 1]
					const dx = point.x - prev.x
					const dz = point.z - prev.z
					distanceAlong += Math.sqrt(dx * dx + dz * dz)
				}

				return {
					x: point.x,
					z: point.z,
					height: point.height,
					distanceAlong,
				}
			})

			return {
				id: route.id,
				type: route.type,
				closed: Boolean(route.closed),
				halfWidth,
				visualHalfWidth: route.visualHalfWidth ?? typeConfig.visualHalfWidth ?? halfWidth + edgeFeather,
				laneOffset: typeConfig.laneOffset ?? 1.2,
				rutWidth: typeConfig.rutWidth ?? 0.35,
				samples,
			}
		})
		.filter(Boolean)
}

const buildSpatialIndex = (segments, cellSize) => {
	const index = new Map()

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]
		const minX = Math.min(segment.ax, segment.bx) - segment.influenceRadius
		const maxX = Math.max(segment.ax, segment.bx) + segment.influenceRadius
		const minZ = Math.min(segment.az, segment.bz) - segment.influenceRadius
		const maxZ = Math.max(segment.az, segment.bz) + segment.influenceRadius
		const minCellX = Math.floor(minX / cellSize)
		const maxCellX = Math.floor(maxX / cellSize)
		const minCellZ = Math.floor(minZ / cellSize)
		const maxCellZ = Math.floor(maxZ / cellSize)

		for (let x = minCellX; x <= maxCellX; x++) {
			for (let z = minCellZ; z <= maxCellZ; z++) {
				const key = cellKey(x, z)
				let bucket = index.get(key)
				if (!bucket) {
					bucket = []
					index.set(key, bucket)
				}
				bucket.push(i)
			}
		}
	}

	return index
}

/**
 * Creates a deterministic spline corridor sampler. The sampler is surface
 * agnostic: road and future river systems can share the same spatial index,
 * nearest-segment evaluation, and path-space coordinates.
 */
export const createSplineCorridorSystem = (config, sampleBase) => {
	if (!config?.enabled || !config.routes?.length) {
		return {
			evaluate: () => NO_SURFACE,
			applyToSample: (x, z, baseSample) => ({ ...baseSample, surface: NO_SURFACE }),
		}
	}

	const cellSize = config.spatialCellSize ?? DEFAULT_SPATIAL_CELL_SIZE
	const segments = createSegments(config.routes, config, sampleBase)
	const spatialIndex = buildSpatialIndex(segments, cellSize)

	const evaluate = (x, z) => {
		const bucket = spatialIndex.get(cellKey(Math.floor(x / cellSize), Math.floor(z / cellSize)))
		if (!bucket) return NO_SURFACE

		let bestSurface = NO_SURFACE
		let bestScore = -Infinity

		for (let i = 0; i < bucket.length; i++) {
			const segment = segments[bucket[i]]
			const relX = x - segment.ax
			const relZ = z - segment.az
			const t = clamp01((relX * segment.dx + relZ * segment.dz) / segment.lengthSq)
			const closestX = segment.ax + segment.dx * t
			const closestZ = segment.az + segment.dz * t
			const offX = x - closestX
			const offZ = z - closestZ
			const distanceSq = offX * offX + offZ * offZ
			if (distanceSq > segment.influenceRadiusSq) continue

			const distance = Math.sqrt(distanceSq)
			const heightInfluence = (1 - smoothstep(segment.halfWidth, segment.influenceRadius, distance)) * segment.carveStrength
			if (heightInfluence <= 0) continue

			const surfaceEdgeStart = Math.max(0, segment.halfWidth - segment.edgeFeather)
			const surfaceEdgeEnd = segment.halfWidth + segment.edgeFeather
			const materialWeight = 1 - smoothstep(surfaceEdgeStart, surfaceEdgeEnd, distance)
			const signedLateral = offX * -segment.dirZ + offZ * segment.dirX
			const pathHeight = mix(segment.heightA, segment.heightB, t) + getProfileOffset(segment.typeConfig, signedLateral, segment.halfWidth)
			const bridgeRaise = mix(segment.bridgeRaiseA, segment.bridgeRaiseB, t)
			const fillAllowance = mix(segment.fillAllowanceA, segment.fillAllowanceB, t)
			const vegetationClearance =
				1 - smoothstep(Math.max(0, segment.vegetationClearanceWidth - segment.edgeFeather), segment.vegetationClearanceWidth, distance)
			const score = segment.priority * 10 + heightInfluence + materialWeight

			if (score > bestScore) {
				bestScore = score
				bestSurface = {
					type: segment.type,
					routeId: segment.routeId,
					weightIndex: segment.weightIndex,
					heightInfluence,
					materialWeight,
					vegetationClearance,
					targetHeight: pathHeight,
					bridgeRaise,
					fillAllowance,
					distanceAlong: segment.distanceStart + segment.length * t,
					lateralOffset: signedLateral,
					halfWidth: segment.halfWidth,
					maxCut: segment.maxCut,
					maxFill: segment.maxFill + fillAllowance,
				}
			}
		}

		return bestSurface
	}

	const applyToSample = (x, z, baseSample) => {
		const surface = evaluate(x, z)
		if (surface === NO_SURFACE) {
			return { ...baseSample, surface }
		}

		const targetDelta = clamp(surface.targetHeight - baseSample.height, -surface.maxCut, surface.maxFill)
		const height = baseSample.height + targetDelta * surface.heightInfluence

		return {
			...baseSample,
			height,
			surface,
		}
	}

	return {
		evaluate,
		applyToSample,
	}
}

export const writeSurfaceWeights = (surface, weights, params, vertexIndex) => {
	const weightOffset = vertexIndex * CHANNEL_COUNT
	const paramOffset = vertexIndex * CHANNEL_COUNT

	if (!surface || surface.weightIndex < 0 || surface.materialWeight <= 0) {
		params[paramOffset] = 0
		params[paramOffset + 1] = 0
		params[paramOffset + 2] = 0
		params[paramOffset + 3] = 0
		return
	}

	weights[weightOffset + surface.weightIndex] = surface.materialWeight
	params[paramOffset] = surface.distanceAlong
	params[paramOffset + 1] = surface.lateralOffset
	params[paramOffset + 2] = surface.halfWidth
	params[paramOffset + 3] = surface.vegetationClearance
}

export { NO_SURFACE }
