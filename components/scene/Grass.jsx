import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, Quaternion, CatmullRomCurve3, DoubleSide, Color, BufferGeometry, BufferAttribute, Object3D, InstancedMesh, ShaderMaterial } from 'three'

import grassVertexShader from '../../shaders/grass.vert.glsl'
import grassFragmentShader from '../../shaders/grass.frag.glsl'

// Default configuration (tuned for realistic scale)
const DEFAULT_BLADE_CONFIG = {
	// Blade dimensions (real world scale: 4-6 inches = 0.1-0.15m)
	height: 0.16, // ~6.3 inches
	baseWidth: 0.005,
	tipWidth: 0.002,

	// Blade shape
	segments: 8,
	curvature: 0.35,
	twist: 0.15,

	// Colors - desert dry grass matching sand texture
	colorBase: '#c9b896',
	colorTip: '#ddd5b8',

	// Lighting
	ambientStrength: 0.6,
	translucency: 0.1,

	// Wind animation
	windStrength: 0.04,
	windFrequency: 1.5,
}

// Patch configuration
const DEFAULT_PATCH_CONFIG = {
	radius: 0.3, // Radius of the patch (~1 foot)
	scaleVariation: 0.2, // How much blade sizes vary (0-1)
	rotationVariation: 0.4, // Variation in rotation (0 = perfectly aligned outward)
	curveStrategy: 'inward', // 'outward', 'inward', 'unified'
	unifiedRotation: 0, // Rotation for unified strategy
}

// Generate procedural grass blade geometry
const createGrassBladeGeometry = (config) => {
	const { height, baseWidth, tipWidth, segments, curvature, twist } = config

	const points = []
	for (let i = 0; i <= segments; i++) {
		const t = i / segments
		const y = t * height
		const x = curvature * Math.pow(t, 2) * height
		const z = Math.sin(t * Math.PI) * curvature * 0.2 * height
		points.push(new Vector3(x, y, z))
	}

	const curve = new CatmullRomCurve3(points)
	const curvePoints = curve.getPoints(segments * 4)

	const vertices = []
	const normals = []
	const uvs = []
	const indices = []

	const up = new Vector3(0, 1, 0)
	const tempVec = new Vector3()
	const tangent = new Vector3()
	const normal = new Vector3()
	const binormal = new Vector3()

	const numPoints = curvePoints.length

	for (let i = 0; i < numPoints; i++) {
		const t = i / (numPoints - 1)
		const point = curvePoints[i]

		if (i < numPoints - 1) {
			tangent.subVectors(curvePoints[i + 1], point).normalize()
		}

		// Linear taper for fuller blade shape
		const widthFactor = 1 - t
		const currentWidth = tipWidth + (baseWidth - tipWidth) * widthFactor

		binormal.crossVectors(up, tangent).normalize()

		const twistAngle = t * twist * Math.PI
		const cos = Math.cos(twistAngle)
		const sin = Math.sin(twistAngle)

		tempVec.copy(binormal)
		binormal.x = tempVec.x * cos - tangent.x * sin
		binormal.z = tempVec.z * cos - tangent.z * sin

		normal.crossVectors(tangent, binormal).normalize()

		vertices.push(point.x - binormal.x * currentWidth * 0.5, point.y - binormal.y * currentWidth * 0.5, point.z - binormal.z * currentWidth * 0.5)
		vertices.push(point.x + binormal.x * currentWidth * 0.5, point.y + binormal.y * currentWidth * 0.5, point.z + binormal.z * currentWidth * 0.5)

		normals.push(normal.x, normal.y, normal.z)
		normals.push(normal.x, normal.y, normal.z)

		uvs.push(0, t)
		uvs.push(1, t)
	}

	for (let i = 0; i < numPoints - 1; i++) {
		const baseIndex = i * 2
		indices.push(baseIndex, baseIndex + 1, baseIndex + 2)
		indices.push(baseIndex + 1, baseIndex + 3, baseIndex + 2)
	}

	return {
		vertices: new Float32Array(vertices),
		normals: new Float32Array(normals),
		uvs: new Float32Array(uvs),
		indices: new Uint16Array(indices),
	}
}

// Unified Grass component
const Grass = ({ 
	position = [0, 0, 0], 
	rotation = [0, 0, 0], 
	scale = 1, 
	count = 80, // Default to patch mode with 80 blades
	bladeConfig = {}, 
	patchConfig = {},
	getTerrainHeight = null,
	getTerrainNormal = null 
}) => {
	const meshRef = useRef()

	// Merge configs
	const finalBladeConfig = useMemo(() => ({ ...DEFAULT_BLADE_CONFIG, ...bladeConfig }), [bladeConfig])
	const finalPatchConfig = useMemo(() => ({ ...DEFAULT_PATCH_CONFIG, ...patchConfig }), [patchConfig])

	// Generate base blade geometry
	const geometry = useMemo(() => {
		const { vertices, normals, uvs, indices } = createGrassBladeGeometry(finalBladeConfig)

		const geom = new BufferGeometry()
		geom.setAttribute('position', new BufferAttribute(vertices, 3))
		geom.setAttribute('normal', new BufferAttribute(normals, 3))
		geom.setAttribute('uv', new BufferAttribute(uvs, 2))
		geom.setIndex(new BufferAttribute(indices, 1))

		return geom
	}, [finalBladeConfig])

	// Create shader material
	const material = useMemo(() => {
		return new ShaderMaterial({
			vertexShader: grassVertexShader,
			fragmentShader: grassFragmentShader,
			defines: {
				USE_INSTANCING: '',
			},
			uniforms: {
				uTime: { value: 0 },
				uWindStrength: { value: finalBladeConfig.windStrength },
				uWindFrequency: { value: finalBladeConfig.windFrequency },
				uColorBase: { value: new Color(finalBladeConfig.colorBase) },
				uColorTip: { value: new Color(finalBladeConfig.colorTip) },
				uAmbientStrength: { value: finalBladeConfig.ambientStrength },
				uTranslucency: { value: finalBladeConfig.translucency },
			},
			side: DoubleSide,
		})
	}, [finalBladeConfig])

	// Create instanced mesh with all blade transforms
	const instancedMesh = useMemo(() => {
		const { radius, scaleVariation, rotationVariation } = finalPatchConfig
		
		// Get patch world position for terrain height sampling
		const patchX = position[0]
		const patchY = position[1]
		const patchZ = position[2]
		
		// Reusable objects for terrain alignment
		const up = new Vector3(0, 1, 0)
		const quaternion = new Quaternion()

		const mesh = new InstancedMesh(geometry, material, count)
		const dummy = new Object3D()

		for (let i = 0; i < count; i++) {
			if (count === 1) {
				// Single blade mode - centered
				dummy.position.set(0, 0, 0)
				dummy.rotation.set(0, 0, 0)
				dummy.scale.setScalar(1)
			} else {
				// Patch mode - scattered
				// Random position within a circular area (looser distribution)
				const angle = Math.random() * Math.PI * 2
				const r = Math.sqrt(Math.random()) * radius // sqrt for even distribution
				const x = Math.cos(angle) * r
				const z = Math.sin(angle) * r
				
				// Calculate world position for this blade
				const worldX = patchX + x
				const worldZ = patchZ + z
				
				// Sample terrain height at blade's world position
				let y = 0
				if (getTerrainHeight) {
					const terrainY = getTerrainHeight(worldX, worldZ)
					// Calculate local Y offset relative to patch position
					y = terrainY - patchY
				}

				// Determine base rotation based on strategy
				let baseRotY
				if (finalPatchConfig.curveStrategy === 'unified') {
					baseRotY = finalPatchConfig.unifiedRotation
				} else if (finalPatchConfig.curveStrategy === 'outward') {
					baseRotY = -angle
				} else {
					// Default to inward
					baseRotY = -angle + Math.PI
				}

				// Apply base rotation plus random variation
				const rotY = baseRotY + (Math.random() - 0.5) * rotationVariation

				// Random scale variation
				const s = 1 - scaleVariation / 2 + Math.random() * scaleVariation

				dummy.position.set(x, y, z)
				
				// Apply terrain normal alignment per-blade
				if (getTerrainNormal) {
					const terrainNormal = getTerrainNormal(worldX, worldZ)
					quaternion.setFromUnitVectors(up, terrainNormal)
					dummy.quaternion.copy(quaternion)
					// Apply Y rotation on top of terrain alignment
					dummy.rotateY(rotY)
				} else {
					dummy.rotation.set(0, rotY, 0)
				}
				
				dummy.scale.setScalar(s)
			}
			
			dummy.updateMatrix()
			mesh.setMatrixAt(i, dummy.matrix)
		}

		mesh.instanceMatrix.needsUpdate = true
		return mesh
	}, [geometry, material, count, finalPatchConfig, position, getTerrainHeight, getTerrainNormal])

	// Animate wind
	useFrame((state) => {
		if (meshRef.current) {
			meshRef.current.material.uniforms.uTime.value = state.clock.elapsedTime
		}
	})

	return <primitive ref={meshRef} object={instancedMesh} position={position} rotation={rotation} scale={scale} />
}

export { DEFAULT_BLADE_CONFIG, DEFAULT_PATCH_CONFIG }
export default Grass
