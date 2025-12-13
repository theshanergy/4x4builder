import { memo, useMemo, useRef, useEffect } from 'react'
import { CylinderGeometry, BoxGeometry, MeshStandardMaterial, DoubleSide, Color, BufferGeometry, Float32BufferAttribute, Matrix4, Vector3, Quaternion, Euler } from 'three'
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
	const verts = [],
		cos45 = R * Math.SQRT1_2
	;[
		[R, R, R, 0, 0, R, cos45, cos45],
		[-R, R, 0, R, -R, 0, -cos45, cos45],
		[-R, -R, -R, 0, 0, -R, -cos45, -cos45],
		[R, -R, 0, -R, R, 0, cos45, -cos45],
	].forEach(([cx, cy, v1x, v1y, v2x, v2y, mx, my]) => verts.push(v1x, 0, v1y, cx, 0, cy, mx, 0, my, cx, 0, cy, v2x, 0, v2y, mx, 0, my))
	const g = new BufferGeometry()
	g.setAttribute('position', new Float32BufferAttribute(verts, 3))
	g.computeVertexNormals()
	return g
})()

const getProfilePoints = (halfH) => {
	const halfTotal = halfH + HOUSING_THICKNESS,
		curve = halfTotal * 0.6
	const pts = [
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

const LightBar = memo(({ width = 12, rows = 1, color = 'white', intensity = 0, position = [0, 0, 0], rotation = [0, 0, 0], curvature }) => {
	const reflectorRef = useRef(),
		ledRef = useRef(),
		housingFrontRef = useRef(),
		lightsActive = useRef(false)
	if (intensity > 0) lightsActive.current = true

	const cols = Math.max(1, width),
		ledCount = rows * cols,
		housingHeight = rows * UNIT_SIZE
	const radius = curvature ? Math.max(0.8, cols * UNIT_SIZE * curvature) : 999999,
		faceRadius = radius + BOX_DEPTH / 2
	const stepAngle = 2 * Math.asin(UNIT_SIZE / (2 * faceRadius)),
		angularSpan = cols * stepAngle

	const ledColor = useMemo(() => new Color(LED_COLORS[color] || LED_COLORS.white), [color])
	const ledMaterial = useMemo(() => new MeshStandardMaterial({ color: ledColor, emissive: ledColor, emissiveIntensity: 0, toneMapped: false }), [ledColor])
	const reflectorMaterial = useMemo(
		() => new MeshStandardMaterial({ color: '#e0e0e0', metalness: 1, roughness: 0.1, emissive: ledColor, emissiveIntensity: 0, toneMapped: false }),
		[ledColor]
	)

	useEffect(() => {
		ledMaterial.emissiveIntensity = intensity * 2
		reflectorMaterial.emissiveIntensity = intensity * 0.5
		ledMaterial.needsUpdate = reflectorMaterial.needsUpdate = true
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
		if (!reflectorRef.current || !ledRef.current || !housingFrontRef.current) return
		const matrix = new Matrix4(),
			pos = new Vector3(),
			quat = new Quaternion(),
			scale = new Vector3(1, 1, 1),
			ledRadius = faceRadius - 0.0125

		leds.forEach((led, i) => {
			pos.set(led.position[0], led.position[1], led.position[2] - REFLECTOR_DEPTH / 2)
			quat.setFromEuler(new Euler(Math.PI / 2, led.angle, 0, 'YXZ'))
			matrix.compose(pos, quat, scale)
			reflectorRef.current.setMatrixAt(i, matrix)

			pos.fromArray(led.position)
			matrix.compose(pos, quat, scale)
			housingFrontRef.current.setMatrixAt(i, matrix)

			pos.set(ledRadius * Math.sin(led.angle), led.position[1], ledRadius * Math.cos(led.angle) - radius)
			quat.setFromEuler(new Euler(0, led.angle, 0))
			matrix.compose(pos, quat, scale)
			ledRef.current.setMatrixAt(i, matrix)
		})
		reflectorRef.current.instanceMatrix.needsUpdate = ledRef.current.instanceMatrix.needsUpdate = housingFrontRef.current.instanceMatrix.needsUpdate = true
	}, [leds, faceRadius, radius])

	const housingGeometry = useMemo(() => {
		const profile = getProfilePoints(housingHeight / 2),
			verts = [],
			indices = [],
			n = profile.length
		for (let i = 0; i <= cols; i++) {
			const angle = -angularSpan / 2 + (i / cols) * angularSpan
			for (const [localZ, localY] of profile) {
				const r = faceRadius + localZ
				verts.push(r * Math.sin(angle), localY, r * Math.cos(angle) - radius)
			}
		}
		for (let i = 0; i < cols; i++)
			for (let j = 0; j < n - 1; j++) {
				const a = i * n + j,
					b = (i + 1) * n + j
				indices.push(a, a + 1, b, b, a + 1, b + 1)
			}
		const g = new BufferGeometry()
		g.setAttribute('position', new Float32BufferAttribute(verts, 3))
		g.setIndex(indices)
		g.computeVertexNormals()
		return g
	}, [radius, housingHeight, angularSpan, faceRadius, cols])

	const endCapGeometry = useMemo(() => {
		const cornerRadius = HOUSING_THICKNESS * 1.2,
			cornerSteps = 6,
			profile = getProfilePoints(housingHeight / 2)
		const capVerts = [],
			capIndices = [],
			n = profile.length
		const profileWidth = Math.max(...profile.map((p) => p[0])) - Math.min(...profile.map((p) => p[0]))

		const rings = Array.from({ length: cornerSteps + 1 }, (_, s) => {
			const theta = (s / cornerSteps) * (Math.PI / 2)
			const scale = Math.max(0, (profileWidth - (1 - Math.cos(theta)) * cornerRadius) / profileWidth)
			return profile.map(([x, y]) => [x * scale, y * scale, Math.sin(theta) * cornerRadius])
		})

		rings.forEach((ring) => ring.forEach(([x, y, z]) => capVerts.push(x, y, z)))

		for (let s = 0; s < cornerSteps; s++) {
			for (let j = 0; j < n - 1; j++) {
				const a = s * n + j,
					b = (s + 1) * n + j
				capIndices.push(a, b, a + 1, a + 1, b, b + 1)
			}
			const a = s * n + n - 1,
				b = (s + 1) * n + n - 1
			capIndices.push(a, b, s * n, s * n, b, (s + 1) * n)
		}

		const lastRingStart = cornerSteps * n,
			lastRing = rings[cornerSteps]
		const centerIdx = capVerts.length / 3
		capVerts.push(lastRing.reduce((s, p) => s + p[0], 0) / n, lastRing.reduce((s, p) => s + p[1], 0) / n, lastRing[0][2])
		for (let j = 0; j < n; j++) capIndices.push(lastRingStart + j, centerIdx, lastRingStart + ((j + 1) % n))

		const g = new BufferGeometry()
		g.setAttribute('position', new Float32BufferAttribute(capVerts, 3))
		g.setIndex(capIndices)
		g.computeVertexNormals()
		return g
	}, [housingHeight])

	const capPos = (a) => [faceRadius * Math.sin(a), 0, faceRadius * Math.cos(a) - radius]
	const bracketPos = (s) => {
		const a = angularSpan * 0.2 * s,
			r = faceRadius - 0.04
		return [r * Math.sin(a), 0, r * Math.cos(a) - radius - 0.008]
	}

	return (
		<group position={position} rotation={rotation}>
			<mesh geometry={housingGeometry} material={HOUSING_MATERIAL} />
			<mesh geometry={endCapGeometry} material={HOUSING_MATERIAL} position={capPos(-angularSpan / 2)} rotation={[0, -angularSpan / 2 - Math.PI / 2, 0]} />
			<mesh geometry={endCapGeometry} material={HOUSING_MATERIAL} position={capPos(angularSpan / 2)} rotation={[0, angularSpan / 2 + Math.PI / 2, Math.PI]} />
			<instancedMesh ref={reflectorRef} args={[REFLECTOR_GEOMETRY, reflectorMaterial, ledCount]} frustumCulled={false} />
			<instancedMesh ref={housingFrontRef} args={[HOUSING_FRONT_GEOMETRY, HOUSING_MATERIAL, ledCount]} frustumCulled={false} />
			<instancedMesh ref={ledRef} args={[LED_GEOMETRY, ledMaterial, ledCount]} frustumCulled={false} />
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
