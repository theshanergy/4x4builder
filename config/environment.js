import { Vector3, Color } from 'three'

// Sun configuration
export const sunDirection = new Vector3(0.6, 0.45, 0.5).normalize()
export const sunColor = new Color().setHSL(0.1, 1.0, 0.93) // Warm sun

// Sky colors - matching old sky appearance
export const skyColorZenith = new Color().setHSL(0.58, 0.57, 0.59) // Deep blue at top
export const skyColorHorizon = new Color().setHSL(0.58, 0.67, 0.85) // Pale blue-white at horizon
