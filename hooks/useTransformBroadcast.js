import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import useMultiplayerStore from '../store/multiplayerStore'
import useGameStore from '../store/gameStore'
import { hornState } from '../components/scene/vehicles/VehicleAudio'

// Broadcast rate: 20 updates per second
const BROADCAST_RATE = 1000 / 20

// Minimum velocity threshold to broadcast (reduces network traffic when stationary)
const MIN_VELOCITY_THRESHOLD = 0.01

// Position delta threshold to force broadcast even if velocity is low
const POSITION_DELTA_THRESHOLD = 0.01

// Precision helpers - reduces message size significantly
const round1 = (v) => Math.round(v * 10) / 10
const round2 = (v) => Math.round(v * 100) / 100
const round3 = (v) => Math.round(v * 1000) / 1000

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
		
		// Get wheel data from vehicle controller
		let wheelRotations = [0, 0, 0, 0]
		let wheelYPositions = [0, 0, 0, 0]
		let steering = 0
		
		if (vehicleController.current) {
			try {
				// Get wheel spin rotations and Y positions from physics controller
				for (let i = 0; i < 4; i++) {
					wheelRotations[i] = vehicleController.current.wheelRotation(i) || 0
					// Get suspension compression for wheel Y position
					const connection = vehicleController.current.wheelChassisConnectionPointCs(i)
					const suspension = vehicleController.current.wheelSuspensionLength(i) || 0
					wheelYPositions[i] = connection?.y - suspension
				}
				// Get steering angle from front wheel
				steering = vehicleController.current.wheelSteering(0) || 0
			} catch (e) {
				// Controller may not be ready
			}
		}
		
		// Get engine state
		const engineRef = useGameStore.getState().engineRef
		const engineRpm = engineRef?.rpm || 850
		
		// Get horn state from mutable state (avoids Zustand store read in render loop)
		const hornActive = hornState.active
		
		// Send transform update to server
		// Values are rounded to reduce message size while maintaining visual fidelity
		sendPlayerUpdate({
			timestamp: Math.round(now),
			position: [round2(position.x), round2(position.y), round2(position.z)],
			rotation: [round3(rotation.x), round3(rotation.y), round3(rotation.z), round3(rotation.w)],
			velocity: [round1(velocity.x), round1(velocity.y), round1(velocity.z)],
			angularVelocity: [round1(angularVelocity.x), round1(angularVelocity.y), round1(angularVelocity.z)],
			wheelRotations: wheelRotations.map(round3),
			wheelYPositions: wheelYPositions.map(round2),
			steering: round2(steering),
			engineRpm: Math.round(engineRpm),
			hornActive,
		})
	})
}

export default useTransformBroadcast
