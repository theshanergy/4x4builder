import { useEffect, useCallback, useRef } from 'react'
import useMultiplayerStore from '../store/multiplayerStore'
import useGameStore from '../store/gameStore'
import { ConnectionState } from '../network/NetworkManager'

// Default server URL - uses environment variable if available
const getServerUrl = () => {
	if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MULTIPLAYER_SERVER_URL) {
		return import.meta.env.VITE_MULTIPLAYER_SERVER_URL
	}
	// Default to localhost for development
	return 'ws://localhost:8080'
}

// Hook for managing network connection lifecycle
export function useNetworkConnection() {
	const connectionState = useMultiplayerStore((state) => state.connectionState)
	const connectionError = useMultiplayerStore((state) => state.connectionError)
	const currentRoom = useMultiplayerStore((state) => state.currentRoom)
	const isHost = useMultiplayerStore((state) => state.isHost)
	const localPlayerId = useMultiplayerStore((state) => state.localPlayerId)
	const playerName = useMultiplayerStore((state) => state.playerName)
	const remotePlayers = useMultiplayerStore((state) => state.remotePlayers)
	const serverAvailable = useMultiplayerStore((state) => state.serverAvailable)
	
	const connect = useMultiplayerStore((state) => state.connect)
	const disconnect = useMultiplayerStore((state) => state.disconnect)
	const createRoom = useMultiplayerStore((state) => state.createRoom)
	const joinRoom = useMultiplayerStore((state) => state.joinRoom)
	const leaveRoom = useMultiplayerStore((state) => state.leaveRoom)
	const setPlayerName = useMultiplayerStore((state) => state.setPlayerName)
	const clearError = useMultiplayerStore((state) => state.clearError)
	const sendVehicleConfig = useMultiplayerStore((state) => state.sendVehicleConfig)
	const checkServerAvailability = useMultiplayerStore((state) => state.checkServerAvailability)
	
	const currentVehicle = useGameStore((state) => state.currentVehicle)
	
	// Track previous vehicle config for change detection
	const prevConfigRef = useRef(null)
	
	// Connect to server with default URL
	const handleConnect = useCallback(async () => {
		const serverUrl = getServerUrl()
		return connect(serverUrl)
	}, [connect])
	
	// Create room with current vehicle config
	const handleCreateRoom = useCallback(async () => {
		return createRoom(currentVehicle)
	}, [createRoom, currentVehicle])
	
	// Join room with current vehicle config
	const handleJoinRoom = useCallback(async (roomId) => {
		return joinRoom(roomId, currentVehicle)
	}, [joinRoom, currentVehicle])
	
	// Sync vehicle config changes when in a room
	useEffect(() => {
		if (!currentRoom) {
			prevConfigRef.current = null
			return
		}
		
		const configString = JSON.stringify(currentVehicle)
		if (configString !== prevConfigRef.current) {
			prevConfigRef.current = configString
			
			// Don't send on initial join
			if (prevConfigRef.current !== null) {
				sendVehicleConfig(currentVehicle)
			}
		}
	}, [currentVehicle, currentRoom, sendVehicleConfig])
	
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
		isHost,
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
		createRoom: handleCreateRoom,
		joinRoom: handleJoinRoom,
		leaveRoom,
		setPlayerName,
		clearError,
		checkServerAvailability,
	}
}

export default useNetworkConnection
