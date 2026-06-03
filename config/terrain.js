const TERRAIN_CONFIG = {
	// Deterministic seed for terrain generation
	seed: 1234,

	// World scaling — shader works in normalized [0,1] space.
	// worldScale: 1 shader unit = worldScale meters.
	// heightScale: shader-height 1.0 = heightScale meters.
	// heightOrigin: shader-height mapped to 0m in world.
	worldScale: 1000,
	heightScale: 400,
	heightOrigin: 0.36,

	// Spawn Area - flat safe zone that transitions to natural terrain
	spawnRadius: 600,

	// --- Base fractal height noise (pre-erosion) ---
	heightFrequency: 3.0,
	heightAmp: 0.125,
	heightOctaves: 3,
	heightLacunarity: 2.0,
	heightGain: 0.1,

	// --- Phacelle-noise erosion ---
	erosion: {
		scale: 0.15,
		strength: 0.22,
		gullyWeight: 0.5,
		detail: 1.5,
		ridgeRounding: 0.1,
		creaseRounding: 0.0,
		roundingInitMult: 0.1,
		roundingOctaveMult: 2.0,
		onsetInitial: 1.25,
		onsetOctave: 1.25,
		onsetRidgeInitial: 2.8,
		onsetRidgeOctave: 1.5,
		assumedSlopeValue: 0.7,
		assumedSlopeAmount: 1.0,
		cellScale: 0.7,
		normalization: 0.5,
		octaves: 5,
		lacunarity: 2.0,
		gain: 0.5,
		heightOffset: -0.65,
		heightOffsetPreserve: 0.0,
	},

	// Ocean boundary — terrain tapers off into the sea beyond this radius
	ocean: {
		// Distance from origin (meters) where land meets the ocean
		radius: 5000,
		// Width of the beach/falloff transition zone (meters)
		transition: 500,
		// How far below water level the ocean floor sinks (meters)
		depth: 30,
		// Normalized depth at the transition midpoint (0 = water surface, 1 = full ocean depth)
		// Controls the shape of the beach profile — lower = gentler initial slope
		beachMidpointDepth: 0.2,
	},

	// Seeded spline corridors. Roads are sampled through a spatial index during
	// terrain generation so visual mesh heights, physics heightfields, material
	// masks, and vegetation exclusion all agree deterministically.
	roads: {
		enabled: true,
		seed: 424242,
		sampleSpacing: 5,
		spatialCellSize: 96,
		normalSampleStep: 2,
		spawnSafeRadius: 120,
		spawnSafeTransition: 160,
		types: {
			dirtDoubleTrack: {
				weightIndex: 0,
				priority: 1,
				width: 5.5,
				shoulderWidth: 4.5,
				heightSmoothing: 90,
				gradeSmoothing: 0.72,
				heightOffset: -0.18,
				carveStrength: 1,
				maxCut: 4,
				maxFill: 1,
				crownHeight: 0.04,
				rutDepth: 0.1,
				laneOffset: 1.25,
				rutWidth: 0.34,
				rutFeather: 0.5,
				edgeFeather: 1.6,
				bridgeLowSpots: {
					enabled: true,
					minSpan: 18,
					maxSpan: 110,
					maxRaise: 28,
					minRaise: 0.18,
					strength: 0.9,
					clearance: 0.12,
					smoothingDistance: 42,
					smoothingStrength: 0.55,
					fillMultiplier: 1.15,
					extraFill: 0.35,
					shoulderStartFill: 1.5,
					shoulderWidthPerFillMeter: 1.35,
					maxShoulderWidth: 42,
				},
			},
		},
		routes: [
			{
				id: 'island-center-double-track',
				type: 'dirtDoubleTrack',
				jitter: 80,
				fixedControlPointIndices: [6],
				procedural: {
					enabled: true,
					start: [-120, -4650],
					end: [120, 4650],
					controlPointCount: 13,
					lateralAmplitude: 310,
					lateralJitter: 150,
					alongJitter: 120,
					frequency: 2.85,
					secondaryAmplitude: 95,
					secondaryFrequency: 5.4,
					anchors: [{ index: 6, point: [0, 0] }],
				},
				topography: {
					enabled: true,
					iterations: 3,
					sampleStep: 95,
					sampleCount: 3,
					strength: 0.72,
					maxOffset: 280,
					gradeWeight: 7,
					alongSlopeWeight: 5,
					crossSlopeWeight: 0.25,
					displacementWeight: 0.35,
				},
			},
		],
	},

	// Terrain Layers (shader material)
	layers: [
		{
			name: 'rock',
			textures: {
				albedo: '/assets/images/ground/dark_rough_rock_albedo.jpg',
				normal: '/assets/images/ground/dark_rough_rock_normal.jpg',
			},
			textureScale: 0.02,
			lod: {
				distance: 400,
				levels: 3,
			},
		},
		{
			name: 'sand',
			textures: {
				albedo: '/assets/images/ground/sand.jpg',
				normal: '/assets/images/ground/sand_normal.jpg',
			},
			textureScale: 0.4,
			normalScale: 0.5,
			height: {
				min: 0,
				max: 45,
				transitionMin: 3,
				transitionMax: 55,
				influence: 1.0,
			},
			slope: {
				max: 0.05,
				influence: 0.9,
				transition: 0.03,
			},
		},
		{
			name: 'dirt_double_track',
			textures: {
				albedo: { procedural: 'road', kind: 'dirtDoubleTrackAlbedo', size: 1 },
				normal: { procedural: 'road', kind: 'dirtDoubleTrackNormal', size: 1 },
			},
			textureScale: 0.18,
			normalScale: 0.0,
			road: {
				type: 'dirtDoubleTrack',
				renderOnTerrain: 'projected',
				weightChannel: 0,
				usePathUV: false,
				laneOffset: 1.25,
				laneWidth: 0.24,
				laneFeather: 0.55,
				rutDarkening: 0.7,
				tint: [1.12, 1.04, 0.9],
				edgeNoise: {
					scale: 0.075,
					strength: 0.42,
					innerBlend: 0.72,
					lateralScale: 3.0,
				},
				laneNoise: {
					scale: 0.12,
					strength: 0.32,
					lateralScale: 5.0,
				},
				visual: {
					enabled: true,
					trackOpacity: 0.78,
					maskPadding: 180,
					maskResolution: [2048, 4096],
				},
			},
		},
	],
}

export default TERRAIN_CONFIG
