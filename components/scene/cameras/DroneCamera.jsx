import { useRef, useEffect, useCallback } from 'react'
import { Vector3, MathUtils, Euler } from 'three'
import { useFrame, useThree } from '@react-three/fiber'

import { vehicleState } from '../../../store/gameStore'
import useInputStore from '../../../store/inputStore'
import { useGroundAvoidance } from '../../../hooks/useGroundAvoidance'

// Drone camera controller - freelook mode with WASD/mouse controls
const DroneCamera = () => {
	const camera = useThree((state) => state.camera)
	const gl = useThree((state) => state.gl)

	// Camera state
	const currentPosition = useRef(camera.position.clone())
	const euler = useRef(new Euler(0, 0, 0, 'YXZ'))
	const isPointerLocked = useRef(false)

	// Movement settings
	const moveSpeed = 15
	const sprintMultiplier = 2.5
	const mouseSensitivity = 0.002
	const gamepadSensitivity = 2.5
	const minGroundDistance = 1.0
	const targetFov = 60
	const lastFov = useRef(camera.fov)

	// Ground avoidance
	const checkGroundAvoidance = useGroundAvoidance(currentPosition, minGroundDistance)

	// Temp vectors
	const moveDirection = useRef(new Vector3())
	const forward = useRef(new Vector3())
	const right = useRef(new Vector3())

	// Initialize camera rotation from current orientation
	useEffect(() => {
		euler.current.setFromQuaternion(camera.quaternion)

		// Position camera above and behind the vehicle if starting fresh
		if (currentPosition.current.distanceTo(vehicleState.position) < 1) {
			currentPosition.current.set(vehicleState.position.x - 10, vehicleState.position.y + 8, vehicleState.position.z - 10)
			camera.position.copy(currentPosition.current)
		}
	}, [camera])

	// Mouse movement handler
	const handleMouseMove = useCallback((event) => {
		if (!isPointerLocked.current) return

		euler.current.y -= event.movementX * mouseSensitivity
		euler.current.x -= event.movementY * mouseSensitivity

		// Clamp vertical rotation to prevent flipping
		euler.current.x = MathUtils.clamp(euler.current.x, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1)
	}, [])

	// Pointer lock handlers
	const handlePointerLockChange = useCallback(() => {
		isPointerLocked.current = document.pointerLockElement === gl.domElement
	}, [gl.domElement])

	const handleClick = useCallback(() => {
		if (!isPointerLocked.current) {
			gl.domElement.requestPointerLock()
		}
	}, [gl.domElement])

	// Set up event listeners
	useEffect(() => {
		document.addEventListener('mousemove', handleMouseMove)
		document.addEventListener('pointerlockchange', handlePointerLockChange)
		gl.domElement.addEventListener('click', handleClick)

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('pointerlockchange', handlePointerLockChange)
			gl.domElement.removeEventListener('click', handleClick)

			// Exit pointer lock when switching away from drone camera
			if (document.pointerLockElement === gl.domElement) {
				document.exitPointerLock()
			}
		}
	}, [gl.domElement, handleMouseMove, handlePointerLockChange, handleClick])

	useFrame((state, delta) => {
		const { keys, input, touchInput } = useInputStore.getState()

		// Handle gamepad look input (right stick)
		const gamepadLookX = input.rightStickX || touchInput.rightStickX || 0
		const gamepadLookY = input.rightStickY || touchInput.rightStickY || 0

		if (Math.abs(gamepadLookX) > 0.1 || Math.abs(gamepadLookY) > 0.1) {
			euler.current.y -= gamepadLookX * gamepadSensitivity * delta
			euler.current.x -= gamepadLookY * gamepadSensitivity * delta
			euler.current.x = MathUtils.clamp(euler.current.x, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1)
		}

		// Apply rotation to camera
		camera.quaternion.setFromEuler(euler.current)

		// Calculate movement direction based on camera orientation
		camera.getWorldDirection(forward.current)
		forward.current.y = 0
		forward.current.normalize()

		right.current.crossVectors(forward.current, new Vector3(0, 1, 0)).normalize()

		// Get keyboard movement input
		let moveX = 0
		let moveY = 0
		let moveZ = 0

		// WASD / Arrow keys
		if (keys.has('w') || keys.has('arrowup')) moveZ += 1
		if (keys.has('s') || keys.has('arrowdown')) moveZ -= 1
		if (keys.has('a') || keys.has('arrowleft')) moveX -= 1
		if (keys.has('d') || keys.has('arrowright')) moveX += 1

		// Vertical movement
		if (keys.has(' ')) moveY += 1 // Space to go up
		if (keys.has('shift')) moveY -= 1 // Shift to go down

		// Gamepad movement (left stick)
		const gamepadMoveX = input.leftStickX || touchInput.leftStickX || 0
		const gamepadMoveZ = -(input.leftStickY || touchInput.leftStickY || 0)

		// Gamepad vertical (triggers)
		const gamepadMoveY = (input.rightTrigger || 0) - (input.leftTrigger || 0)

		// Combine inputs
		moveX += gamepadMoveX
		moveZ += gamepadMoveZ
		moveY += gamepadMoveY

		// Calculate final move direction
		moveDirection.current.set(0, 0, 0)
		moveDirection.current.addScaledVector(right.current, moveX)
		moveDirection.current.addScaledVector(forward.current, moveZ)
		moveDirection.current.y = moveY

		// Apply sprint multiplier
		const isSprinting = keys.has('shift') || input.leftBumper
		const speed = moveSpeed * (isSprinting ? sprintMultiplier : 1)

		// Normalize horizontal movement to prevent faster diagonal movement
		const horizontalLength = Math.sqrt(moveDirection.current.x ** 2 + moveDirection.current.z ** 2)
		if (horizontalLength > 1) {
			moveDirection.current.x /= horizontalLength
			moveDirection.current.z /= horizontalLength
		}

		// Apply movement
		currentPosition.current.addScaledVector(moveDirection.current, speed * delta)

		// Ground avoidance
		checkGroundAvoidance()

		// Apply position to camera
		camera.position.copy(currentPosition.current)

		// Smoothly transition FOV
		const newFov = MathUtils.damp(camera.fov, targetFov, 3, delta)
		if (Math.abs(newFov - lastFov.current) > 0.01) {
			camera.fov = newFov
			camera.updateProjectionMatrix()
			lastFov.current = newFov
		}
	})

	return null
}

export default DroneCamera
