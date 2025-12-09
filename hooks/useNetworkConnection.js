import { useCallback } from 'react'
import useMultiplayerStore, { getServerUrl } from '../store/multiplayerStore'
import useGameStore from '../store/gameStore'
import { ConnectionState } from '../network/NetworkManager'

// Hook for managing network connection lifecycle
export function useNetworkConnection() {
	const connectionState = useMultiplayerStore((state) => state.connectionState)
	const connectionError = useMultiplayerStore((state) => state.connectionError)
	const currentRoom = useMultiplayerStore((state) => state.currentRoom)
	const localPlayerId = useMultiplayerStore((state) => state.localPlayerId)
	const playerName = useMultiplayerStore((state) => state.playerName)
	const remotePlayers = useMultiplayerStore((state) => state.remotePlayers)
	const serverAvailable = useMultiplayerStore((state) => state.serverAvailable)
	
	const connect = useMultiplayerStore((state) => state.connect)
	const disconnect = useMultiplayerStore((state) => state.disconnect)
	const joinRoom = useMultiplayerStore((state) => state.joinRoom)
	const leaveRoom = useMultiplayerStore((state) => state.leaveRoom)
	const setPlayerName = useMultiplayerStore((state) => state.setPlayerName)
	const clearError = useMultiplayerStore((state) => state.clearError)
	const checkServerAvailability = useMultiplayerStore((state) => state.checkServerAvailability)
	
	const currentVehicle = useGameStore((state) => state.currentVehicle)
	
	// Connect to server with default URL
	const handleConnect = useCallback(async () => {
		const serverUrl = getServerUrl()
		return connect(serverUrl)
	}, [connect])
	
	// Join room (or create if no roomId) with current vehicle config
	const handleJoinRoom = useCallback(async (roomId) => {
		return joinRoom(roomId, currentVehicle)
	}, [joinRoom, currentVehicle])
	
	// Note: Vehicle config sync is handled by useConfigSync hook with debouncing
	
	// Derived state
	const isConnected = connectionState === ConnectionState.CONNECTED
	const isConnecting = connectionState === ConnectionState.CONNECTING || 
		connectionState === ConnectionState.RECONNECTING
	const isInRoom = currentRoom !== null
	const remotePlayerCount = Object.keys(remotePlayers).length
	
	return {
		// State
		connectionState,
		connectionError,
		currentRoom,
		localPlayerId,
		playerName,
		remotePlayers,
		serverAvailable,
		
		// Derived state
		isConnected,
		isConnecting,
		isInRoom,
		remotePlayerCount,
		
		// Actions
		connect: handleConnect,
		disconnect,
		joinRoom: handleJoinRoom,
		leaveRoom,
		setPlayerName,
		clearError,
		checkServerAvailability,
	}
}

export default useNetworkConnection
