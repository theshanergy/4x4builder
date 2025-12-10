import { useRef, useEffect, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { AnimationMixer, LoopRepeat, Vector3, MathUtils } from 'three'
import { GLTFLoader } from 'three-stdlib'

import { vehicleState } from '../../../store/gameStore'

// Normalize angle to -PI to PI range
const normalizeAngle = (angle) => MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI

// Circle parameters
const CIRCLE_SPEED = 0.1
const RADIUS = 200
const HEIGHT = 30
const FLY_SPEED = 40
const CLIMB_PORTION = 0.25
const CLIMB_END = Math.PI * 2 * CLIMB_PORTION

export default function Hawk() {
	const groupRef = useRef()
	const actionRef = useRef()
	const lastY = useRef(0)
	const isFlapping = useRef(false)
	const currentAngle = useRef(0)
	const currentRotation = useRef(0)
	const prevPosition = useRef(new Vector3())

	const { scene, animations } = useLoader(GLTFLoader, '/assets/models/environment/hawk.glb')

	const mixer = useMemo(() => new AnimationMixer(scene), [scene])

	useEffect(() => {
		if (animations.length > 0) {
			const action = mixer.clipAction(animations[0])
			action.setLoop(LoopRepeat)
			actionRef.current = action
		}
		return () => mixer.stopAllAction()
	}, [animations, mixer])

	useFrame((_, delta) => {
		mixer.update(delta)

		if (!groupRef.current) return

		const targetPos = vehicleState.position
		const hawkPos = groupRef.current.position

		const dx = targetPos.x - hawkPos.x
		const dz = targetPos.z - hawkPos.z
		const distanceToTarget = Math.hypot(dx, dz)
		const angleToHawk = Math.atan2(hawkPos.x - targetPos.x, hawkPos.z - targetPos.z)

		let newX, newZ

		if (distanceToTarget > RADIUS * 1.2) {
			// Outside circle: fly toward target
			const moveDistance = FLY_SPEED * delta
			newX = hawkPos.x + (dx / distanceToTarget) * moveDistance
			newZ = hawkPos.z + (dz / distanceToTarget) * moveDistance
			currentAngle.current = Math.atan2(newX - targetPos.x, newZ - targetPos.z)
		} else if (distanceToTarget < RADIUS * 0.8) {
			// Inside circle: move outward while circling
			currentAngle.current += delta * CIRCLE_SPEED
			const circleX = targetPos.x + Math.sin(currentAngle.current) * RADIUS
			const circleZ = targetPos.z + Math.cos(currentAngle.current) * RADIUS
			const blendSpeed = 2 * delta
			newX = hawkPos.x + (circleX - hawkPos.x) * blendSpeed
			newZ = hawkPos.z + (circleZ - hawkPos.z) * blendSpeed
		} else {
			// Transition zone: smooth circling
			const angleDiff = normalizeAngle(angleToHawk - currentAngle.current)
			const angleAdjustSpeed = Math.min(Math.abs(angleDiff) * 0.5, 1) * delta
			currentAngle.current += angleDiff * angleAdjustSpeed + delta * CIRCLE_SPEED
			newX = targetPos.x + Math.sin(currentAngle.current) * RADIUS
			newZ = targetPos.z + Math.cos(currentAngle.current) * RADIUS
		}

		// Calculate height with bobbing pattern
		const bobCycle = MathUtils.euclideanModulo(currentAngle.current * 6, Math.PI * 2)
		const bobValue = bobCycle < CLIMB_END ? Math.sin((bobCycle / CLIMB_END) * (Math.PI / 2)) : Math.cos(((bobCycle - CLIMB_END) / (Math.PI * 2 - CLIMB_END)) * (Math.PI / 2))
		const currentY = targetPos.y + HEIGHT + bobValue * 4

		// Update position
		hawkPos.set(newX, currentY, newZ)

		// Update rotation based on movement direction
		const moveDx = newX - prevPosition.current.x
		const moveDz = newZ - prevPosition.current.z
		if (Math.hypot(moveDx, moveDz) > 0.001) {
			const targetRotation = Math.atan2(moveDx, moveDz)
			const rotDiff = normalizeAngle(targetRotation - currentRotation.current)
			currentRotation.current += rotDiff * Math.min(delta * 3, 1)
			groupRef.current.rotation.y = currentRotation.current
		}

		prevPosition.current.set(newX, currentY, newZ)

		// Flap when gaining elevation, glide when descending
		if (actionRef.current) {
			const isGainingElevation = currentY > lastY.current
			if (isGainingElevation && !isFlapping.current) {
				actionRef.current.reset().play()
				isFlapping.current = true
			} else if (!isGainingElevation && isFlapping.current) {
				actionRef.current.fadeOut(0.3)
				isFlapping.current = false
			}
		}

		lastY.current = currentY
	})

	return (
		<group ref={groupRef} dispose={null}>
			<primitive object={scene} />
		</group>
	)
}
