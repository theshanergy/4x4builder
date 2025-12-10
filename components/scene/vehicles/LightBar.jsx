import { memo, useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'

// Initialize RectAreaLight support (only needs to happen once)
RectAreaLightUniformsLib.init()

// Shared geometry and materials (created once, reused across all instances)
const REFLECTOR_GEOMETRY = new THREE.CylinderGeometry(0.018, 0.006, 0.015, 8, 1, true)
const LED_GEOMETRY = new THREE.BoxGeometry(0.006, 0.006, 0.003)
const REFLECTOR_MATERIAL = new THREE.MeshStandardMaterial({
	color: '#e0e0e0',
	metalness: 1.0,
	roughness: 0.1,
	side: THREE.DoubleSide,
})

// Rotation for reflector cylinders
const REFLECTOR_ROTATION = new THREE.Euler(Math.PI / 2, 0, 0)

// Shared housing materials
const HOUSING_MATERIAL = new THREE.MeshStandardMaterial({
	color: '#111',
	roughness: 0.6,
	metalness: 0.8,
})
const HOUSING_MATERIAL_DOUBLE = new THREE.MeshStandardMaterial({
	color: '#111',
	roughness: 0.6,
	metalness: 0.8,
	side: THREE.DoubleSide,
})
const BRACKET_MATERIAL = new THREE.MeshStandardMaterial({
	color: '#333',
	roughness: 0.5,
	metalness: 0.8,
})
const GLASS_MATERIAL = new THREE.MeshStandardMaterial({
	color: 'white',
	transparent: true,
	opacity: 0.15,
	roughness: 0.1,
	metalness: 0,
	side: THREE.DoubleSide,
	depthWrite: false,
})
const BRACKET_GEOMETRY = new THREE.BoxGeometry(0.015, 0.025, 0.02)

// Create a rounded rectangle shape (centered at origin)
const createRoundedRectShape = (w, h, r) => {
	const shape = new THREE.Shape()
	shape.moveTo(-w / 2 + r, -h / 2)
	shape.lineTo(w / 2 - r, -h / 2)
	shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
	shape.lineTo(w / 2, h / 2 - r)
	shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
	shape.lineTo(-w / 2 + r, h / 2)
	shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
	shape.lineTo(-w / 2, -h / 2 + r)
	shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
	return shape
}

// Main LightBar component
const LightBar = memo(({ width = 12, rows = 1, color = 'white', intensity = 0, position = [0, 0, 0], rotation = [0, 0, 0] }) => {
	// Refs for instanced meshes
	const reflectorInstanceRef = useRef()
	const ledInstanceRef = useRef()

	// Track if light has ever been activated
	const lightsActive = useRef(false)
	if (intensity > 0 && !lightsActive.current) {
		lightsActive.current = true
	}

	// Calculate dimensions
	const unitSize = 0.04 // Spacing between LED centers (40mm)
	const paddingX = 0.015
	// Reduce vertical padding if bar is wider than it is tall
	const paddingY = width > rows ? 0.008 : 0.015

	// Width now represents number of horizontal LEDs (columns)
	const cols = Math.max(1, width)
	const ledCount = rows * cols

	const housingWidth = cols * unitSize + paddingX * 2
	const housingHeight = rows * unitSize + paddingY * 2
	const housingDepth = 0.07 // Housing depth

	// LED Color Calculation based on color prop
	const ledColor = useMemo(() => {
		switch (color) {
			case 'amber':
				return new THREE.Color('#ffaa00')
			case 'warm':
				return new THREE.Color('#ffcc00')
			case 'cool':
				return new THREE.Color('#ccffff')
			case 'white':
			default:
				return new THREE.Color('#ffffff')
		}
	}, [color])

	// LED material - memoized and updated when color/intensity changes
	const ledMaterial = useMemo(
		() =>
			new THREE.MeshStandardMaterial({
				color: ledColor,
				emissive: ledColor,
				emissiveIntensity: intensity * 2,
				toneMapped: false,
			}),
		[ledColor, intensity]
	)

	// Generate LED grid positions
	const leds = useMemo(() => {
		const items = []
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const x = (c - (cols - 1) / 2) * unitSize
				const y = -(r - (rows - 1) / 2) * unitSize
				// Position reflectors so they sit flush with the front face
				items.push({ key: `${r}-${c}`, position: [x, y, housingDepth / 2 - 0.0075], x, y })
			}
		}
		return items
	}, [rows, cols, unitSize, housingDepth])

	// Update instanced mesh transforms when LEDs change
	useEffect(() => {
		if (!reflectorInstanceRef.current || !ledInstanceRef.current) return

		const tempMatrix = new THREE.Matrix4()
		const tempPosition = new THREE.Vector3()
		const tempQuaternion = new THREE.Quaternion().setFromEuler(REFLECTOR_ROTATION)
		const tempScale = new THREE.Vector3(1, 1, 1)
		const identityQuaternion = new THREE.Quaternion()

		leds.forEach((led, i) => {
			// Reflector instance (rotated)
			tempPosition.set(led.position[0], led.position[1], led.position[2])
			tempMatrix.compose(tempPosition, tempQuaternion, tempScale)
			reflectorInstanceRef.current.setMatrixAt(i, tempMatrix)

			// LED chip instance (offset in z, no rotation)
			tempPosition.set(led.position[0], led.position[1], led.position[2] - 0.005)
			tempMatrix.compose(tempPosition, identityQuaternion, tempScale)
			ledInstanceRef.current.setMatrixAt(i, tempMatrix)
		})

		reflectorInstanceRef.current.instanceMatrix.needsUpdate = true
		ledInstanceRef.current.instanceMatrix.needsUpdate = true
	}, [leds])

	// Housing geometry with cutouts for reflectors
	const housingGeometry = useMemo(() => {
		// Outer shape (rounded rectangle)
		const shape = createRoundedRectShape(housingWidth, housingHeight, 0.008)

		// Add holes for each LED reflector
		const holeRadius = 0.019 // Slightly larger than reflector (0.018)
		for (const led of leds) {
			const hole = new THREE.Path()
			hole.absarc(led.x, led.y, holeRadius, 0, Math.PI * 2, true)
			shape.holes.push(hole)
		}

		// Extrude settings
		const extrudeSettings = {
			depth: housingDepth,
			bevelEnabled: false,
		}

		const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
		// Center the geometry on z-axis
		geometry.translate(0, 0, -housingDepth / 2)

		return geometry
	}, [housingWidth, housingHeight, housingDepth, leds])

	// Memoized rounded rectangle shape for the back plate
	const backShape = useMemo(() => {
		return createRoundedRectShape(housingWidth, housingHeight, 0.008)
	}, [housingWidth, housingHeight])

	// Memoized rounded rectangle shape for the glass front
	const glassShape = useMemo(() => {
		return createRoundedRectShape(housingWidth - 0.02, housingHeight - 0.02, 0.005)
	}, [housingWidth, housingHeight])

	return (
		<group position={position} rotation={rotation}>
			{/* Main Housing Body with cutouts */}
			<mesh geometry={housingGeometry} material={HOUSING_MATERIAL} />

			{/* Back Plate */}
			<mesh position={[0, 0, -housingDepth / 2 - 0.0005]} rotation={[0, Math.PI, 0]}>
				<shapeGeometry args={[backShape]} />
				<primitive object={HOUSING_MATERIAL_DOUBLE} attach='material' />
			</mesh>

			{/* Instanced Reflector Cups */}
			<instancedMesh ref={reflectorInstanceRef} args={[REFLECTOR_GEOMETRY, REFLECTOR_MATERIAL, ledCount]} frustumCulled={false} />

			{/* Instanced LED Chips */}
			<instancedMesh ref={ledInstanceRef} args={[LED_GEOMETRY, ledMaterial, ledCount]} frustumCulled={false} />

			{/* RectAreaLight - creates light from the entire bar surface, rotated to face forward */}
			{/* Only load if light has ever been activated */}
			{lightsActive.current && (
				<rectAreaLight
					position={[0, 0, housingDepth / 2 - 0.015]}
					rotation={[0, Math.PI, 0]}
					width={housingWidth - 0.02}
					height={housingHeight * 0.8}
					intensity={intensity * 15}
					color={ledColor}
				/>
			)}

			{/* Glass Front Face - 2D plane with rounded corners */}
			<mesh position={[0, 0, housingDepth / 2 + 0.002]}>
				<shapeGeometry args={[glassShape]} />
				<primitive object={GLASS_MATERIAL} attach='material' />
			</mesh>

			{/* Mounting Brackets */}
			<mesh position={[housingWidth * 0.3, 0, -housingDepth / 2 - 0.008]} geometry={BRACKET_GEOMETRY} material={BRACKET_MATERIAL} />
			<mesh position={[-housingWidth * 0.3, 0, -housingDepth / 2 - 0.008]} geometry={BRACKET_GEOMETRY} material={BRACKET_MATERIAL} />
		</group>
	)
})

export default LightBar
