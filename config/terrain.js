const TERRAIN_CONFIG = {
	// Deterministic seed for terrain generation
	seed: 1234,

	// World scaling — noise fields work in normalized space.
	// worldScale: 1 shader unit = worldScale meters.
	// heightScale: normalization used by the erosion filter (shader-height 1.0 = heightScale meters).
	worldScale: 1000,
	heightScale: 400,

	// Spawn Area - flat safe zone that transitions to natural terrain
	spawnRadius: 600,

	// --- Climate fields (biome backbone) ---
	// Frequencies are in shader units (1 / worldScale meters), so e.g.
	// frequency 0.105 ≈ a 9.5 km wavelength.
	climate: {
		// Deep ocean (-1) → shoreline (~0) → far inland (+1). Domain-warped.
		// `contrast` stretches the (center-heavy) fbm distribution across the
		// full field range via tanh — higher = more extreme oceans/inland.
		continental: {
			frequency: 0.105,
			octaves: 3,
			lacunarity: 2.0,
			gain: 0.5,
			contrast: 3.6,
			// Positive bias shifts the world toward land (less ocean coverage)
			bias: 0.15,
			warpFrequency: 0.35,
			warpStrength: 0.45,
		},
		// Sandy desert (0) → lush grassland/forest (1)
		moisture: {
			frequency: 0.16,
			octaves: 3,
			lacunarity: 2.0,
			gain: 0.5,
			contrast: 3.6,
		},
		// Where inland terrain is allowed to grow ridged peaks (0..1)
		mountain: {
			frequency: 0.2,
			octaves: 2,
			lacunarity: 2.0,
			gain: 0.5,
			contrast: 3.4,
		},
		// Ease all fields toward fixed values near the origin so every seed
		// spawns in the same flat coastal-desert setting.
		spawn: {
			innerRadius: 700,
			radius: 2800,
			continental: 0.07,
			moisture: 0.2,
			mountain: 0.1,
		},
	},

	// Base elevation (meters) as a function of continentalness.
	// Piecewise-smoothstep control points, sorted by continentalness.
	elevationSpline: [
		[-1.0, -54],
		[-0.35, -44],
		[-0.12, -16],
		[-0.03, -3],
		[0.03, 2.5],
		[0.1, 7],
		[0.22, 16],
		[0.4, 42],
		[0.6, 95],
		[0.8, 150],
		[1.0, 190],
	],

	// --- Rolling-hills fractal noise (medium-scale relief) ---
	hills: {
		frequency: 3.0,
		octaves: 3,
		lacunarity: 2.0,
		gain: 0.1,
		amplitude: 25,
		// Hill amplitude ramps up with continentalness across this range so
		// beaches/coastal plains stay gentle (occasional inlets and ponds)
		// while inland terrain gets full relief.
		oceanFade: [-0.06, 0.35],
		oceanFloorScale: 0.3,
	},

	// --- Ridged-fractal mountains ---
	mountains: {
		frequency: 0.21,
		octaves: 5,
		lacunarity: 2.05,
		gain: 0.5,
		// Peak height contribution in meters (on top of the elevation spline)
		amplitude: 380,
		// Mountains only inland: smoothstep over continentalness
		continentalGate: [0.16, 0.42],
		// ...and only where the mountainness field is high
		peaksGate: [0.55, 0.8],
	},

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
		heightOffset: 0.0,
		heightOffsetPreserve: 0.0,
		// Erosion ramps in across this pre-erosion height band (meters) so
		// beaches stay smooth and underwater terrain skips erosion entirely.
		shoreFade: [1.5, 20],
		// Erosion strength multiplier inside mountain massifs
		mountainBoost: 1.45,
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

	// Terrain Layers (shader material). Layers paint in order over the base
	// (index 0). Conditions within a group multiply; `anyOf` groups combine
	// with max() so a layer can cover several distinct situations (e.g. sand
	// on beaches OR in arid deserts).
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
			name: 'grass',
			textures: {
				albedo: '/assets/images/ground/wispy-grass-meadow_albedo.jpg',
				normal: '/assets/images/ground/wispy-grass-meadow_normal.jpg',
			},
			textureScale: 0.18,
			normalScale: 0.6,
			height: {
				min: 1.5,
				max: 250,
				transitionMin: 2.5,
				transitionMax: 45,
				influence: 1.0,
			},
			slope: {
				max: 0.4,
				influence: 1.0,
				transition: 0.2,
			},
			climate: {
				moisture: {
					min: 0.44,
					transition: 0.09,
					noise: { scale: 0.025, strength: 0.16 },
				},
			},
			// Large-scale hue variation so meadows read as patchy, not uniform
			colorVariation: {
				scale: 0.004,
				strength: 0.45,
				color: [0.82, 0.78, 0.5],
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
			anyOf: [
				// Beaches — low elevation flats next to the waterline, any biome
				{
					height: {
						min: -10,
						max: 4.5,
						transitionMin: 6,
						transitionMax: 3.5,
						influence: 1.0,
					},
					slope: {
						max: 0.2,
						influence: 0.85,
						transition: 0.12,
					},
				},
				// Arid desert — dry climate at low/mid elevation
				{
					height: {
						max: 95,
						transitionMax: 40,
						influence: 1.0,
					},
					slope: {
						max: 0.28,
						influence: 0.9,
						transition: 0.15,
					},
					climate: {
						moisture: {
							max: 0.36,
							transition: 0.08,
							noise: { scale: 0.025, strength: 0.16 },
						},
					},
				},
			],
		},
		{
			name: 'snow',
			textures: {
				albedo: '/assets/images/ground/snow.jpg',
				normal: '/assets/images/ground/snow_normal.jpg',
			},
			textureScale: 0.09,
			normalScale: 0.7,
			height: {
				min: 240,
				transitionMin: 50,
				influence: 1.0,
				// Break the snowline up with world-space noise (meters)
				noise: { scale: 0.012, strength: 60 },
			},
			slope: {
				max: 0.55,
				influence: 0.85,
				transition: 0.25,
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
