import { useEffect, useRef, useMemo, useCallback, memo } from 'react'
import useMultiplayerStore from '../../../store/multiplayerStore'
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

	// Set up transform update listener using zustand's subscribe
	useEffect(() => {
		// Create a handler for player updates that pushes transforms to vehicles
		const handlePlayerUpdate = (playerId, transform) => {
			const ref = vehicleRefs.current.get(playerId)
			if (ref?.userData?.pushTransform) {
				ref.userData.pushTransform(transform)
			}
		}

		// Store the handler on the multiplayerStore for the network callback to use
		useMultiplayerStore.setState({
			_pushTransformToVehicle: handlePlayerUpdate,
		})

		return () => {
			useMultiplayerStore.setState({
				_pushTransformToVehicle: null,
			})
		}
	}, [])

	// Register/unregister vehicle refs - memoized to prevent unnecessary effect re-runs in RemoteVehicle
	const registerVehicleRef = useCallback((playerId, ref) => {
		if (ref) {
			vehicleRefs.current.set(playerId, ref)
		} else {
			vehicleRefs.current.delete(playerId)
		}
	}, [])

	// Don't render if not in a room
	if (!currentRoom) {
		return null
	}

	return (
		<group name='RemoteVehicles'>
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
	return <RemoteVehicle playerId={playerId} playerName={playerName} vehicleConfig={vehicleConfig} initialTransform={initialTransform} onRef={onRef} />
})

export default RemoteVehicleManager
