import { createGrassMesh } from '../utils/vegetation/grassMesh'

const VEGETATION_CONFIG = [
	{
		name: 'grass',
		meshFactory: createGrassMesh, // Use procedural grass mesh factory
		scale: {
			min: 1.0,
			max: 1.2,
		},
		slope: {
			min: 0.0,
			max: 0.5, // Only on relatively flat areas (inverted from original 0.85 threshold)
		},
		height: {
			min: -1,
			max: 100,
		},
		density: 5000,
		maxLod: 1,
		collider: null, // No collider needed for grass
	},
]

export default VEGETATION_CONFIG
