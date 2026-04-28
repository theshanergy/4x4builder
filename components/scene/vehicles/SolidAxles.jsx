import { memo, Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { MathUtils, MeshStandardMaterial, Quaternion, Vector3 } from 'three'

import cloneWithMaterials from '../../../utils/cloneWithMaterials'

const DIFFERENTIAL_MODEL = '/assets/models/misc/differential.glb'
const X_AXIS = new Vector3(1, 0, 0)
const Y_AXIS = new Vector3(0, 1, 0)

const DEFAULT_AXLE_CONFIG = {
	radius: 0.04,
	color: '#111111',
	differential: true,
	differentialColor: '#181818',
	differentialScale: 1,
	differentialRotation: [0, 0, Math.PI / 2],
	driveshaft: true,
	driveshaftRadius: 0.025,
	driveshaftColor: '#151515',
	driveshaftFrameYOffset: 0.03,
	driveshaftAxleZOffset: 0.14,
	lowerControlArms: true,
	lowerControlArmRadius: 0.032,
	lowerControlArmColor: '#111111',
	lowerControlArmLength: 0.74,
	lowerControlArmAxleInset: 0.2,
	lowerControlArmFrameInset: 0.05,
	lowerControlArmFrameYOffset: -0.02,
	lowerControlArmAxleYOffset: -0.055,
	lowerControlArmBrackets: true,
	lowerControlArmBracketColor: '#0c0c0c',
	lowerControlArmFrameBracketSize: [0.11, 0.075, 0.1],
	lowerControlArmAxleBracketSize: [0.07, 0.11, 0.09],
	brakes: true,
	brakeRotorThickness: 0.025,
	brakeCaliperColor: '#cc0000',
}

const AXLE_DEFAULTS = {
	front: {
		name: 'Front',
		leftWheelIndex: 0,
		rightWheelIndex: 1,
		differentialOffset: 0.18,
		frameDirection: -1,
		driveshaftFrameZ: 0.42,
		driveshaftAxleZOffset: -0.14,
	},
	rear: {
		name: 'Rear',
		leftWheelIndex: 2,
		rightWheelIndex: 3,
		differentialOffset: 0,
		frameDirection: 1,
		driveshaftFrameZ: -0.42,
	},
}

const syncCylinderBetweenPoints = (mesh, start, end, direction, midpoint, quaternion) => {
	if (!mesh) return

	direction.copy(end).sub(start)
	const length = direction.length()
	mesh.visible = length > 0.001
	if (!mesh.visible) return

	direction.divideScalar(length)
	midpoint.copy(start).add(end).multiplyScalar(0.5)

	mesh.position.copy(midpoint)
	quaternion.setFromUnitVectors(Y_AXIS, direction)
	mesh.quaternion.copy(quaternion)
	mesh.scale.y = length
}

const syncBracket = (mesh, position, quaternion = null) => {
	if (!mesh) return

	mesh.position.copy(position)
	if (quaternion) {
		mesh.quaternion.copy(quaternion)
	} else {
		mesh.quaternion.identity()
	}
}

const syncWheelVisualTilt = (visualRef, wheel, camberQuaternion, inverseQuaternion, localQuaternion) => {
	if (!visualRef?.current || !wheel) return

	inverseQuaternion.copy(wheel.quaternion).invert()
	localQuaternion.copy(inverseQuaternion).multiply(camberQuaternion).multiply(wheel.quaternion)
	visualRef.current.quaternion.copy(localQuaternion)
}

const normalizeAxleConfig = (axleConfig, defaults) => {
	if (!axleConfig) return null

	const normalized = axleConfig === true ? {} : axleConfig
	if (normalized.enabled === false) return null

	return {
		...DEFAULT_AXLE_CONFIG,
		...defaults,
		...normalized,
	}
}

const DifferentialModel = memo(({ material }) => {
	const gltf = useGLTF(DIFFERENTIAL_MODEL)

	const scene = useMemo(() => {
		const { scene: clonedScene } = cloneWithMaterials(gltf.scene)

		clonedScene.traverse((child) => {
			if (!child.isMesh) return
			child.material = material
		})

		return clonedScene
	}, [gltf.scene, material])

	return <primitive object={scene} />
})

DifferentialModel.displayName = 'DifferentialModel'

const BrakeAssembly = memo(({ config, material, caliperMaterial }) => {
	const caliperDepth = config.brakeRotorThickness * 2
	const rotorRadius = config.brakeRotorRadius

	return (
		<group name='BrakeAssembly'>
			<mesh castShadow receiveShadow material={material}>
				<cylinderGeometry args={[rotorRadius, rotorRadius, config.brakeRotorThickness, 48]} />
			</mesh>
			<mesh castShadow receiveShadow material={material}>
				<cylinderGeometry args={[rotorRadius * 0.34, rotorRadius * 0.34, config.brakeRotorThickness * 1.6, 32]} />
			</mesh>
			<group name='BrakeCaliper' position={[0, 0, rotorRadius * 0.9]} rotation={[0, Math.PI / 2, 0]}>
				<mesh castShadow receiveShadow material={caliperMaterial}>
					<boxGeometry args={[rotorRadius * 0.24, caliperDepth, rotorRadius * 0.55]} />
				</mesh>
				<mesh position={[rotorRadius * 0.11, 0, rotorRadius * 0.21]} castShadow receiveShadow material={caliperMaterial}>
					<boxGeometry args={[rotorRadius * 0.24, caliperDepth * 1.05, rotorRadius * 0.08]} />
				</mesh>
				<mesh position={[rotorRadius * 0.11, 0, -rotorRadius * 0.21]} castShadow receiveShadow material={caliperMaterial}>
					<boxGeometry args={[rotorRadius * 0.24, caliperDepth * 1.05, rotorRadius * 0.08]} />
				</mesh>
			</group>
		</group>
	)
})

BrakeAssembly.displayName = 'BrakeAssembly'

const ControlArmBracket = memo(({ size, material }) => (
	<mesh castShadow receiveShadow material={material}>
		<boxGeometry args={size} />
	</mesh>
))

ControlArmBracket.displayName = 'ControlArmBracket'

const SolidAxle = memo(({ config, wheelRefs, wheelVisualRefs, wheelWidth, rimDiameter, frameHeight }) => {
	const sharedMaterial = useMemo(
		() =>
			new MeshStandardMaterial({
				color: config.color,
				metalness: 0.4,
				roughness: 0.65,
			}),
		[config.color]
	)

	const caliperMaterial = useMemo(
		() =>
			new MeshStandardMaterial({
				color: config.brakeCaliperColor,
				metalness: 0.3,
				roughness: 0.5,
			}),
		[config.brakeCaliperColor]
	)

	const axleGroupRef = useRef()
	const tubeRef = useRef()
	const differentialRef = useRef()
	const driveshaftRef = useRef()
	const leftControlArmRef = useRef()
	const rightControlArmRef = useRef()
	const leftFrameBracketRef = useRef()
	const rightFrameBracketRef = useRef()
	const leftAxleBracketRef = useRef()
	const rightAxleBracketRef = useRef()
	const leftBrakeRef = useRef()
	const rightBrakeRef = useRef()

	const leftPosition = useMemo(() => new Vector3(), [])
	const rightPosition = useMemo(() => new Vector3(), [])
	const leftInsetPosition = useMemo(() => new Vector3(), [])
	const rightInsetPosition = useMemo(() => new Vector3(), [])
	const midpoint = useMemo(() => new Vector3(), [])
	const axleDirection = useMemo(() => new Vector3(), [])
	const axleQuaternion = useMemo(() => new Quaternion(), [])
	const wheelCamberQuaternion = useMemo(() => new Quaternion(), [])
	const inverseWheelQuaternion = useMemo(() => new Quaternion(), [])
	const visualWheelQuaternion = useMemo(() => new Quaternion(), [])
	const differentialPosition = useMemo(() => new Vector3(), [])
	const driveshaftFramePoint = useMemo(() => new Vector3(), [])
	const driveshaftAxlePoint = useMemo(() => new Vector3(), [])
	const leftControlArmFramePoint = useMemo(() => new Vector3(), [])
	const leftControlArmAxlePoint = useMemo(() => new Vector3(), [])
	const rightControlArmFramePoint = useMemo(() => new Vector3(), [])
	const rightControlArmAxlePoint = useMemo(() => new Vector3(), [])
	const linkDirection = useMemo(() => new Vector3(), [])
	const linkMidpoint = useMemo(() => new Vector3(), [])
	const linkQuaternion = useMemo(() => new Quaternion(), [])

	useFrame(() => {
		const leftWheel = wheelRefs[config.leftWheelIndex]?.current
		const rightWheel = wheelRefs[config.rightWheelIndex]?.current
		if (!axleGroupRef.current || !tubeRef.current || !leftWheel || !rightWheel) return

		leftPosition.copy(leftWheel.position)
		rightPosition.copy(rightWheel.position)

		axleDirection.copy(leftPosition).sub(rightPosition)
		const wheelDistance = axleDirection.length()
		if (wheelDistance <= 0.001) return

		axleDirection.divideScalar(wheelDistance)

		const inset = Math.min(config.inset ?? wheelWidth / 2, wheelDistance * 0.45)
		leftInsetPosition.copy(leftPosition).addScaledVector(axleDirection, -inset)
		rightInsetPosition.copy(rightPosition).addScaledVector(axleDirection, inset)
		midpoint.copy(leftInsetPosition).add(rightInsetPosition).multiplyScalar(0.5)

		axleGroupRef.current.position.copy(midpoint)
		axleQuaternion.setFromUnitVectors(Y_AXIS, axleDirection)
		axleGroupRef.current.quaternion.copy(axleQuaternion)
		wheelCamberQuaternion.setFromUnitVectors(X_AXIS, axleDirection)
		syncWheelVisualTilt(wheelVisualRefs?.[config.leftWheelIndex], leftWheel, wheelCamberQuaternion, inverseWheelQuaternion, visualWheelQuaternion)
		syncWheelVisualTilt(wheelVisualRefs?.[config.rightWheelIndex], rightWheel, wheelCamberQuaternion, inverseWheelQuaternion, visualWheelQuaternion)

		const axleLength = Math.max(0.01, wheelDistance - inset * 2)
		tubeRef.current.scale.y = axleLength

		const halfLength = axleLength / 2
		const differentialOffset = MathUtils.clamp(config.differentialOffset, -halfLength, halfLength)
		differentialPosition.copy(midpoint).addScaledVector(axleDirection, differentialOffset)

		if (differentialRef.current) {
			differentialRef.current.position.y = differentialOffset
		}

		if (leftBrakeRef.current) leftBrakeRef.current.position.y = axleLength / 2
		if (rightBrakeRef.current) rightBrakeRef.current.position.y = -axleLength / 2

		if (config.driveshaft) {
			driveshaftFramePoint.set(0, frameHeight + config.driveshaftFrameYOffset, config.driveshaftFrameZ)
			driveshaftAxlePoint.copy(differentialPosition)
			driveshaftAxlePoint.z += config.driveshaftAxleZOffset
			syncCylinderBetweenPoints(driveshaftRef.current, driveshaftFramePoint, driveshaftAxlePoint, linkDirection, linkMidpoint, linkQuaternion)
		}

		if (config.lowerControlArms) {
			const frameMountZ = midpoint.z + config.frameDirection * config.lowerControlArmLength
			const frameMountY = frameHeight + config.lowerControlArmFrameYOffset

			leftControlArmAxlePoint.copy(leftInsetPosition).addScaledVector(axleDirection, -config.lowerControlArmAxleInset)
			leftControlArmAxlePoint.y += config.lowerControlArmAxleYOffset
			leftControlArmFramePoint.copy(leftControlArmAxlePoint).addScaledVector(axleDirection, -config.lowerControlArmFrameInset)
			leftControlArmFramePoint.y = frameMountY
			leftControlArmFramePoint.z = frameMountZ

			rightControlArmAxlePoint.copy(rightInsetPosition).addScaledVector(axleDirection, config.lowerControlArmAxleInset)
			rightControlArmAxlePoint.y += config.lowerControlArmAxleYOffset
			rightControlArmFramePoint.copy(rightControlArmAxlePoint).addScaledVector(axleDirection, config.lowerControlArmFrameInset)
			rightControlArmFramePoint.y = frameMountY
			rightControlArmFramePoint.z = frameMountZ

			syncCylinderBetweenPoints(leftControlArmRef.current, leftControlArmFramePoint, leftControlArmAxlePoint, linkDirection, linkMidpoint, linkQuaternion)
			syncCylinderBetweenPoints(rightControlArmRef.current, rightControlArmFramePoint, rightControlArmAxlePoint, linkDirection, linkMidpoint, linkQuaternion)

			if (config.lowerControlArmBrackets) {
				syncBracket(leftFrameBracketRef.current, leftControlArmFramePoint)
				syncBracket(rightFrameBracketRef.current, rightControlArmFramePoint)
				syncBracket(leftAxleBracketRef.current, leftControlArmAxlePoint, axleQuaternion)
				syncBracket(rightAxleBracketRef.current, rightControlArmAxlePoint, axleQuaternion)
			}
		}
	})

	const brakeConfig = useMemo(
		() => ({
			...config,
			brakeRotorRadius: config.brakeRotorRadius ?? (rimDiameter / 2) * 0.68,
		}),
		[config, rimDiameter]
	)

	return (
		<group name={`${config.name}SolidAxleSystem`}>
			<group ref={axleGroupRef} name={`${config.name}SolidAxle`}>
				<mesh ref={tubeRef} castShadow receiveShadow material={sharedMaterial}>
					<cylinderGeometry args={[config.radius, config.radius, 1, 16]} />
				</mesh>
				{config.differential && (
					<group ref={differentialRef} rotation={config.differentialRotation} scale={config.differentialScale}>
						<Suspense fallback={null}>
						<DifferentialModel material={sharedMaterial} />
						</Suspense>
					</group>
				)}
				{config.brakes && (
					<>
						<group ref={leftBrakeRef}>
						<BrakeAssembly config={brakeConfig} material={sharedMaterial} caliperMaterial={caliperMaterial} />
					</group>
					<group ref={rightBrakeRef}>
						<BrakeAssembly config={brakeConfig} material={sharedMaterial} caliperMaterial={caliperMaterial} />
						</group>
					</>
				)}
			</group>
			{config.driveshaft && (
			<mesh ref={driveshaftRef} name={`${config.name}Driveshaft`} castShadow receiveShadow material={sharedMaterial}>
				<cylinderGeometry args={[config.driveshaftRadius, config.driveshaftRadius, 1, 16]} />
				</mesh>
			)}
			{config.lowerControlArms && (
				<>
				<mesh ref={leftControlArmRef} name={`${config.name}LeftLowerControlArm`} castShadow receiveShadow material={sharedMaterial}>
					<cylinderGeometry args={[config.lowerControlArmRadius, config.lowerControlArmRadius, 1, 12]} />
				</mesh>
				<mesh ref={rightControlArmRef} name={`${config.name}RightLowerControlArm`} castShadow receiveShadow material={sharedMaterial}>
					<cylinderGeometry args={[config.lowerControlArmRadius, config.lowerControlArmRadius, 1, 12]} />
					</mesh>
					{config.lowerControlArmBrackets && (
						<>
							<group ref={leftFrameBracketRef} name={`${config.name}LeftFrameLowerControlArmBracket`}>
							<ControlArmBracket size={config.lowerControlArmFrameBracketSize} material={sharedMaterial} />
						</group>
						<group ref={rightFrameBracketRef} name={`${config.name}RightFrameLowerControlArmBracket`}>
							<ControlArmBracket size={config.lowerControlArmFrameBracketSize} material={sharedMaterial} />
						</group>
						<group ref={leftAxleBracketRef} name={`${config.name}LeftAxleLowerControlArmBracket`}>
							<ControlArmBracket size={config.lowerControlArmAxleBracketSize} material={sharedMaterial} />
						</group>
						<group ref={rightAxleBracketRef} name={`${config.name}RightAxleLowerControlArmBracket`}>
							<ControlArmBracket size={config.lowerControlArmAxleBracketSize} material={sharedMaterial} />
							</group>
						</>
					)}
				</>
			)}
		</group>
	)
})

SolidAxle.displayName = 'SolidAxle'

const SolidAxles = memo(({ solidAxles, wheelRefs, wheelVisualRefs, wheelWidth, rimDiameter, frameHeight }) => {
	const axleConfigs = useMemo(() => {
		if (!solidAxles) return []

		const configuredAxles = solidAxles === true ? { front: true, rear: true } : solidAxles

		return [
			normalizeAxleConfig(configuredAxles.front, AXLE_DEFAULTS.front),
			normalizeAxleConfig(configuredAxles.rear, AXLE_DEFAULTS.rear),
		].filter(Boolean)
	}, [solidAxles])

	useEffect(() => {
		const enabledWheelIndices = new Set()
		axleConfigs.forEach((axleConfig) => {
			enabledWheelIndices.add(axleConfig.leftWheelIndex)
			enabledWheelIndices.add(axleConfig.rightWheelIndex)
		})

		wheelVisualRefs?.forEach((ref, index) => {
			if (!enabledWheelIndices.has(index)) ref.current?.quaternion.identity()
		})
	}, [axleConfigs, wheelVisualRefs])

	useEffect(() => {
		return () => {
			wheelVisualRefs?.forEach((ref) => ref.current?.quaternion.identity())
		}
	}, [wheelVisualRefs])

	if (axleConfigs.length === 0) return null

	return (
		<group name='SolidAxles'>
			{axleConfigs.map((axleConfig) => (
				<SolidAxle key={axleConfig.name} config={axleConfig} wheelRefs={wheelRefs} wheelVisualRefs={wheelVisualRefs} wheelWidth={wheelWidth} rimDiameter={rimDiameter} frameHeight={frameHeight} />
			))}
		</group>
	)
})

SolidAxles.displayName = 'SolidAxles'

useGLTF.preload(DIFFERENTIAL_MODEL)

export default SolidAxles
