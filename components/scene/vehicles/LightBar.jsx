import { memo, useMemo, useRef, useEffect } from 'react'
import {
	CylinderGeometry,
	BoxGeometry,
	MeshStandardMaterial,
	DoubleSide,
	Color,
	BufferGeometry,
	Float32BufferAttribute,
	Matrix4,
	Vector3,
	Quaternion,
	Euler,
	Shape,
	ShapeGeometry,
} from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'

RectAreaLightUniformsLib.init()

const R = 0.018,
	UNIT_SIZE = R * 2,
	REFLECTOR_DEPTH = 0.015,
	BOX_DEPTH = 0.025,
	HOUSING_THICKNESS = 0.008
const REFLECTOR_GEOMETRY = new CylinderGeometry(R, 0.006, 0.015, 8, 1, true).scale(-1, 1, 1)
const LED_GEOMETRY = new BoxGeometry(0.006, 0.006, 0.003)
const BRACKET_GEOMETRY = new BoxGeometry(0.015, 0.025, 0.02)
const HOUSING_MATERIAL = new MeshStandardMaterial({ color: '#111', roughness: 0.6, metalness: 0, side: DoubleSide })
const LED_COLORS = { amber: '#ffaa00', warm: '#ffcc00', cool: '#ccffff', white: '#ffffff' }

const HOUSING_FRONT_GEOMETRY = (() => {
	const vertices = [],
		cos45 = R * Math.SQRT1_2
	;[
		[R, R, R, 0, 0, R, cos45, cos45],
		[-R, R, 0, R, -R, 0, -cos45, cos45],
		[-R, -R, -R, 0, 0, -R, -cos45, -cos45],
		[R, -R, 0, -R, R, 0, cos45, -cos45],
	].forEach(([cx, cy, v1x, v1y, v2x, v2y, mx, my]) => {
		vertices.push(v1x, 0, v1y, cx, 0, cy, mx, 0, my, cx, 0, cy, v2x, 0, v2y, mx, 0, my)
	})
	const geom = new BufferGeometry()
	geom.setAttribute('position', new Float32BufferAttribute(vertices, 3))
	geom.computeVertexNormals()
	return geom
})()

const LightBar = memo(({ width = 12, rows = 1, color = 'white', intensity = 0, position = [0, 0, 0], rotation = [0, 0, 0], curvature }) => {
	const refs = { reflector: useRef(), led: useRef(), housingFront: useRef() }
	const lightsActive = useRef(false)
	if (intensity > 0) lightsActive.current = true

	const cols = Math.max(1, width),
		ledCount = rows * cols,
		housingHeight = rows * UNIT_SIZE
	const radius = curvature ? Math.max(0.8, cols * UNIT_SIZE * curvature) : 999999,
		faceRadius = radius + BOX_DEPTH / 2
	const stepAngle = 2 * Math.asin(UNIT_SIZE / (2 * faceRadius)),
		angularSpan = cols * stepAngle
	const extensionAngle = HOUSING_THICKNESS / faceRadius

	const ledColor = useMemo(() => new Color(LED_COLORS[color] || LED_COLORS.white), [color])
	const ledMaterial = useMemo(() => new MeshStandardMaterial({ color: ledColor, emissive: ledColor, emissiveIntensity: 0, toneMapped: false }), [ledColor])
	const reflectorMaterial = useMemo(() => new MeshStandardMaterial({ color: '#e0e0e0', metalness: 1, roughness: 0.1, emissive: ledColor, emissiveIntensity: 0, toneMapped: false }), [ledColor])

	// Update emissive intensity when it changes (keeps material reference stable for instanced mesh)
	useEffect(() => {
		ledMaterial.emissiveIntensity = intensity * 2
		ledMaterial.needsUpdate = true
		reflectorMaterial.emissiveIntensity = intensity * 0.5
		reflectorMaterial.needsUpdate = true
	}, [ledMaterial, reflectorMaterial, intensity])

	const leds = useMemo(() => {
		const frontRadius = faceRadius * Math.cos(stepAngle / 2),
			startAngle = (-(cols - 1) * stepAngle) / 2
		return Array.from({ length: ledCount }, (_, i) => {
			const angle = startAngle + (i % cols) * stepAngle
			return { position: [frontRadius * Math.sin(angle), -(Math.floor(i / cols) - (rows - 1) / 2) * UNIT_SIZE, frontRadius * Math.cos(angle) - radius], angle }
		})
	}, [rows, cols, ledCount, faceRadius, stepAngle, radius])

	useEffect(() => {
		if (!refs.reflector.current || !refs.led.current || !refs.housingFront.current) return
		const matrix = new Matrix4(),
			pos = new Vector3(),
			quat = new Quaternion(),
			scale = new Vector3(1, 1, 1),
			ledRadius = faceRadius - 0.0125

		leds.forEach((led, i) => {
			pos.set(led.position[0], led.position[1], led.position[2] - REFLECTOR_DEPTH / 2)
			quat.setFromEuler(new Euler(Math.PI / 2, led.angle, 0, 'YXZ'))
			matrix.compose(pos, quat, scale)
			refs.reflector.current.setMatrixAt(i, matrix)

			pos.fromArray(led.position)
			matrix.compose(pos, quat, scale)
			refs.housingFront.current.setMatrixAt(i, matrix)

			pos.set(ledRadius * Math.sin(led.angle), led.position[1], ledRadius * Math.cos(led.angle) - radius)
			quat.setFromEuler(new Euler(0, led.angle, 0))
			matrix.compose(pos, quat, scale)
			refs.led.current.setMatrixAt(i, matrix)
		})
		refs.reflector.current.instanceMatrix.needsUpdate = refs.led.current.instanceMatrix.needsUpdate = refs.housingFront.current.instanceMatrix.needsUpdate = true
	}, [leds, faceRadius, radius])

	// Generate profile points for housing cross-section
	const getProfilePoints = (halfH) => {
		const halfTotal = halfH + HOUSING_THICKNESS,
			curve = halfTotal * 0.6,
			pts = [
				[0, -halfH],
				[0, -halfTotal],
				[-BOX_DEPTH, -halfTotal],
			]
		for (let i = 0; i <= 16; i++) {
			const theta = -Math.PI / 2 + (Math.PI * i) / 16
			pts.push([-BOX_DEPTH - Math.cos(theta) * curve, Math.sin(theta) * halfTotal])
		}
		return [...pts, [-BOX_DEPTH, halfTotal], [0, halfTotal], [0, halfH]]
	}

	const housingGeometry = useMemo(() => {
		const profilePoints = getProfilePoints(housingHeight / 2),
			vertices = [],
			indices = [],
			extendedCols = cols + 2

		for (let i = 0; i <= extendedCols; i++) {
			const angle = i === 0 ? -angularSpan / 2 - extensionAngle : i === extendedCols ? angularSpan / 2 + extensionAngle : -angularSpan / 2 + ((i - 1) / cols) * angularSpan
			for (const [localZ, localY] of profilePoints) {
				const r = faceRadius + localZ
				vertices.push(r * Math.sin(angle), localY, r * Math.cos(angle) - radius)
			}
		}

		const n = profilePoints.length
		for (let i = 0; i < extendedCols; i++) {
			for (let j = 0; j < n - 1; j++) {
				const a = i * n + j,
					b = (i + 1) * n + j
				indices.push(a, a + 1, b, b, a + 1, b + 1)
			}
		}

		const geom = new BufferGeometry()
		geom.setAttribute('position', new Float32BufferAttribute(vertices, 3))
		geom.setIndex(indices)
		geom.computeVertexNormals()
		return geom
	}, [radius, housingHeight, angularSpan, faceRadius, cols, extensionAngle])

	const endCapGeometry = useMemo(() => {
		const shape = new Shape()
		getProfilePoints(housingHeight / 2).forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)))
		return new ShapeGeometry(shape)
	}, [housingHeight])

	const sideFillGeometry = useMemo(() => {
		const halfH = housingHeight / 2,
			inner = angularSpan / 2,
			outer = inner + extensionAngle
		const vertices = [],
			corners = [
				[inner, -halfH],
				[outer, -halfH],
				[outer, halfH],
				[inner, halfH],
			]
		;[0, 1, 2, 0, 2, 3].forEach((idx) => {
			const [angle, y] = corners[idx]
			vertices.push(faceRadius * Math.sin(angle), y, faceRadius * Math.cos(angle) - radius)
		})
		const geom = new BufferGeometry()
		geom.setAttribute('position', new Float32BufferAttribute(vertices, 3))
		geom.computeVertexNormals()
		return geom
	}, [housingHeight, angularSpan, faceRadius, radius, extensionAngle])

	const extendedAngularSpan = angularSpan + 2 * extensionAngle
	const capPos = (angle) => [faceRadius * Math.sin(angle), 0, faceRadius * Math.cos(angle) - radius]
	const bracketPos = (sign) => {
		const angle = angularSpan * 0.2 * sign,
			r = faceRadius - 0.04
		return [r * Math.sin(angle), 0, r * Math.cos(angle) - radius - 0.008]
	}

	return (
		<group position={position} rotation={rotation}>
			<mesh geometry={housingGeometry} material={HOUSING_MATERIAL} />
			<mesh geometry={endCapGeometry} material={HOUSING_MATERIAL} position={capPos(-extendedAngularSpan / 2)} rotation={[0, -extendedAngularSpan / 2 - Math.PI / 2, 0]} />
			<mesh geometry={endCapGeometry} material={HOUSING_MATERIAL} position={capPos(extendedAngularSpan / 2)} rotation={[0, extendedAngularSpan / 2 + Math.PI / 2, Math.PI]} />
			<mesh geometry={sideFillGeometry} material={HOUSING_MATERIAL} />
			<mesh geometry={sideFillGeometry} material={HOUSING_MATERIAL} scale={[-1, 1, 1]} />
			<instancedMesh ref={refs.reflector} args={[REFLECTOR_GEOMETRY, reflectorMaterial, ledCount]} frustumCulled={false} />
			<instancedMesh ref={refs.housingFront} args={[HOUSING_FRONT_GEOMETRY, HOUSING_MATERIAL, ledCount]} frustumCulled={false} />
			<instancedMesh ref={refs.led} args={[LED_GEOMETRY, ledMaterial, ledCount]} frustumCulled={false} />
			{lightsActive.current && (
				<rectAreaLight
					position={[0, 0, 0]}
					rotation={[0, Math.PI, 0]}
					width={cols * UNIT_SIZE * 0.9}
					height={housingHeight * 0.8}
					intensity={intensity * 15}
					color={ledColor}
				/>
			)}
			<mesh position={bracketPos(-1)} geometry={BRACKET_GEOMETRY} material={HOUSING_MATERIAL} />
			<mesh position={bracketPos(1)} geometry={BRACKET_GEOMETRY} material={HOUSING_MATERIAL} />
		</group>
	)
})

export default LightBar
