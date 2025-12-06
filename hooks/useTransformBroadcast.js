import { useRef, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import useMultiplayerStore from '../store/multiplayerStore'
import useGameStore from '../store/gameStore'

// Broadcast rate: 20 updates per second
const BROADCAST_RATE = 1000 / 20

// Minimum velocity threshold to broadcast (reduces network traffic when stationary)
const MIN_VELOCITY_THRESHOLD = 0.01

// Position delta threshold to force broadcast even if velocity is low
const POSITION_DELTA_THRESHOLD = 0.01

/**
 * Hook to broadcast local player's vehicle transform to the server
 * @param {Object} chassisRef - Reference to the Rapier RigidBody
 * @param {Object} chassisGroupRef - Reference to the visual group (for interpolated position)
 * @param {Array} wheelRefs - Array of refs to wheel groups
 * @param {Object} vehicleController - Rapier vehicle controller reference
 */
export function useTransformBroadcast(chassisRef, chassisGroupRef, wheelRefs, vehicleController) {
	const lastBroadcast = useRef(0)
	const lastPosition = useRef({ x: 0, y: 0, z: 0 })
	const lastRotation = useRef({ x: 0, y: 0, z: 0, w: 1 })
	
	useFrame(() => {
		// Check if we're connected and in a room
		const { currentRoom, sendPlayerUpdate } = useMultiplayerStore.getState()
		if (!currentRoom || !chassisRef.current) return
		
		const now = performance.now()
		if (now - lastBroadcast.current < BROADCAST_RATE) return
		
		// Get physics state from rigid body
		const position = chassisRef.current.translation()
		const rotation = chassisRef.current.rotation()
		const velocity = chassisRef.current.linvel()
		const angularVelocity = chassisRef.current.angvel()
		
		// Calculate velocity magnitude
		const velocityMagnitude = Math.sqrt(
			velocity.x * velocity.x + 
			velocity.y * velocity.y + 
			velocity.z * velocity.z
		)
		
		// Calculate position delta
		const positionDelta = Math.sqrt(
			Math.pow(position.x - lastPosition.current.x, 2) +
			Math.pow(position.y - lastPosition.current.y, 2) +
			Math.pow(position.z - lastPosition.current.z, 2)
		)
		
		// Skip broadcast if vehicle is stationary and hasn't moved
		if (velocityMagnitude < MIN_VELOCITY_THRESHOLD && positionDelta < POSITION_DELTA_THRESHOLD) {
			return
		}
		
		lastBroadcast.current = now
		lastPosition.current = { x: position.x, y: position.y, z: position.z }
		lastRotation.current = { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }
		
		// Get wheel rotations from wheel refs
		const wheelRotations = wheelRefs.map(ref => {
			if (!ref.current) return 0
			return ref.current.rotation?.x || 0
		})
		
		// Get steering angle from vehicle controller if available
		let steering = 0
		if (vehicleController.current) {
			try {
				steering = vehicleController.current.wheelSteering(0) || 0
			} catch (e) {
				// Controller may not be ready
			}
		}
		
		// Get engine state
		const engineRef = useGameStore.getState().engineRef
		const engineRpm = engineRef?.rpm || 850
		
		// Send transform update to server
		sendPlayerUpdate({
			timestamp: now,
			position: [position.x, position.y, position.z],
			rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
			velocity: [velocity.x, velocity.y, velocity.z],
			angularVelocity: [angularVelocity.x, angularVelocity.y, angularVelocity.z],
			wheelRotations,
			steering,
			engineRpm,
		})
	})
}

export default useTransformBroadcast
