import { useEffect, useRef, useMemo, memo } from 'react'
import { useFrame } from '@react-three/fiber'
import useMultiplayerStore from '../../store/multiplayerStore'
import RemoteVehicle from './RemoteVehicle'

/**
 * RemoteVehicleManager - Manages rendering of all remote players' vehicles
 * Subscribes to multiplayer store and creates/updates RemoteVehicle instances
 */
const RemoteVehicleManager = () => {
	const remotePlayers = useMultiplayerStore((state) => state.remotePlayers)
	const currentRoom = useMultiplayerStore((state) => state.currentRoom)
	
	// Store refs to remote vehicle components for transform updates
	const vehicleRefs = useRef(new Map())

	// Convert remotePlayers object to array for rendering
	const playerArray = useMemo(() => {
		return Object.entries(remotePlayers).map(([id, player]) => ({
			id,
			...player,
		}))
	}, [remotePlayers])

	// Set up transform update listener
	useEffect(() => {
		const networkManager = useMultiplayerStore.getState().networkManager
		if (!networkManager) return

		// Subscribe to player updates for transform pushes
		const handlePlayerUpdate = (message) => {
			const { playerId, ...transform } = message
			
			// Find the vehicle ref for this player and push transform
			vehicleRefs.current.forEach((ref, refPlayerId) => {
				if (refPlayerId === playerId && ref?.userData?.pushTransform) {
					ref.userData.pushTransform(transform)
				}
			})
		}

		// Store original callback
		const originalCallback = networkManager.callbacks.onPlayerUpdate

		// Wrap the callback to also handle our transform updates
		networkManager.on('onPlayerUpdate', (message) => {
			// Call original store callback first
			originalCallback?.(message)
			// Then handle our transform update
			handlePlayerUpdate(message)
		})

		return () => {
			// Restore original callback
			networkManager.on('onPlayerUpdate', originalCallback)
		}
	}, [])

	// Register/unregister vehicle refs
	const registerVehicleRef = (playerId, ref) => {
		if (ref) {
			vehicleRefs.current.set(playerId, ref)
		} else {
			vehicleRefs.current.delete(playerId)
		}
	}

	// Don't render if not in a room
	if (!currentRoom) {
		return null
	}

	return (
		<group name="RemoteVehicles">
			{playerArray.map((player) => (
				<RemoteVehicleWrapper
					key={player.id}
					playerId={player.id}
					playerName={player.name || player.playerName || 'Player'}
					vehicleConfig={player.vehicleConfig}
					initialTransform={player.transform}
					onRef={(ref) => registerVehicleRef(player.id, ref)}
				/>
			))}
		</group>
	)
}

/**
 * Wrapper component to handle ref registration
 */
const RemoteVehicleWrapper = memo(({ playerId, playerName, vehicleConfig, initialTransform, onRef }) => {
	const groupRef = useRef()

	useEffect(() => {
		// Wait for next frame to ensure ref is set
		const timeout = setTimeout(() => {
			if (groupRef.current) {
				onRef(groupRef.current)
			}
		}, 0)
		
		return () => {
			clearTimeout(timeout)
			onRef(null)
		}
	}, [onRef])

	// Use useFrame to keep ref updated
	useFrame(() => {
		if (groupRef.current && !groupRef.current.userData.registered) {
			onRef(groupRef.current)
			groupRef.current.userData.registered = true
		}
	})

	return (
		<group ref={groupRef}>
			<RemoteVehicle
				playerId={playerId}
				playerName={playerName}
				vehicleConfig={vehicleConfig}
				initialTransform={initialTransform}
			/>
		</group>
	)
})

export default RemoteVehicleManager
