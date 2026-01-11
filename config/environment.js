import { Vector3, Color } from 'three'

const ENVIRONMENT_CONFIG = {
	// Sun configuration
	sunDirection: new Vector3(0.545, 0.365, 0.4).normalize(),
	sunColor: new Color().setHSL(0.1, 1.0, 0.93), // Warm sun

	// Sky colors
	skyColorZenith: new Color().setHSL(0.58, 0.57, 0.59), // Deep blue at top
	skyColorHorizon: new Color().setHSL(0.58, 0.67, 0.85), // Pale blue-white at horizon
}

export default ENVIRONMENT_CONFIG
