import { create } from 'zustand'
import NetworkManager, { ConnectionState } from '../network/NetworkManager.js'
import useGameStore from './gameStore.js'

// Default server URL - uses environment variable if available
export const getServerUrl = () => {
	if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MULTIPLAYER_SERVER_URL) {
		return import.meta.env.VITE_MULTIPLAYER_SERVER_URL
	}
	// Default to localhost for development
	return 'ws://localhost:8080'
}

// Multiplayer store
const useMultiplayerStore = create((set, get) => ({
	// Connection state
	connectionState: ConnectionState.DISCONNECTED,
	connectionError: null,
	
	// Player identity
	localPlayerId: null,
	playerName: localStorage.getItem('playerName') || 'Player',
	
	// Room state
	currentRoom: null,
	
	// Remote players (Map-like object: playerId -> playerState)
	remotePlayers: {},
	
	// Chat state
	chatMessages: [],
	chatOpen: false,
	
	// Network manager instance
	networkManager: null,
	
	// Latency
	latency: 0,
	
	// Handler for pushing transforms to vehicles (set by RemoteVehicleManager)
	_pushTransformToVehicle: null,
	
	// Initialize network manager
	initNetworkManager: (serverUrl) => {
		const existing = get().networkManager
		if (existing) {
			existing.disconnect()
		}
		
		const networkManager = new NetworkManager({ serverUrl })
		
		// Set up callbacks
		networkManager
			.on('onStateChange', (state) => {
				set({ connectionState: state })
			})
			.on('onWelcome', (message) => {
				set({ 
					localPlayerId: message.playerId,
					connectionError: null,
				})
			})
			.on('onError', (message) => {
				set({ connectionError: message.message })
			})
			.on('onRoomEntered', (message) => {
				set({
					currentRoom: message.roomState,
					connectionError: null,
				})
				// Initialize remote players from room state
				get().syncRemotePlayers(message.roomState.players)
				// Enable physics so vehicles don't spawn floating
				useGameStore.getState().setPhysicsEnabled(true)
			})
			.on('onRoomLeft', () => {
				set({
					currentRoom: null,
					remotePlayers: {},
					chatMessages: [],
					chatOpen: false,
				})
			})
			.on('onRoomState', (message) => {
				set({
					currentRoom: message.roomState,
				})
				get().syncRemotePlayers(message.roomState.players)
			})
			.on('onRoomClosed', (message) => {
				set({
					currentRoom: null,
					remotePlayers: {},
					chatMessages: [],
					chatOpen: false,
					connectionError: message.reason,
				})
			})
			.on('onPlayerJoined', (message) => {
				const { player } = message
				if (player.id !== get().localPlayerId) {
					set((state) => ({
						remotePlayers: {
							...state.remotePlayers,
							[player.id]: player,
						},
					}))
				}
			})
			.on('onPlayerLeft', (message) => {
				const { playerId } = message
				set((state) => {
					const { [playerId]: removed, ...rest } = state.remotePlayers
					return { remotePlayers: rest }
				})
			})
			.on('onPlayerUpdate', (message) => {
				const { playerId, ...transform } = message
				console.log('[multiplayerStore] onPlayerUpdate', playerId, 'localPlayerId:', get().localPlayerId)
				if (playerId !== get().localPlayerId) {
					// Push transform to vehicle via the handler (if registered)
					const pushHandler = get()._pushTransformToVehicle
					console.log('[multiplayerStore] pushHandler:', !!pushHandler)
					if (pushHandler) {
						pushHandler(playerId, transform)
					}
					
					// Also update store state
					set((state) => {
						const existing = state.remotePlayers[playerId]
						if (!existing) return state
						return {
							remotePlayers: {
								...state.remotePlayers,
								[playerId]: {
									...existing,
									...transform,
									lastUpdate: Date.now(),
								},
							},
						}
					})
				}
			})
			.on('onVehicleConfig', (message) => {
				const { playerId, config } = message
				if (playerId !== get().localPlayerId) {
					set((state) => {
						const existing = state.remotePlayers[playerId]
						if (!existing) return state
						return {
							remotePlayers: {
								...state.remotePlayers,
								[playerId]: {
									...existing,
									vehicleConfig: config,
								},
							},
						}
					})
				}
			})
			.on('onPlayerNameUpdate', (message) => {
				const { playerId, name } = message
				if (playerId !== get().localPlayerId) {
					set((state) => {
						const existing = state.remotePlayers[playerId]
						if (!existing) return state
						return {
							remotePlayers: {
								...state.remotePlayers,
								[playerId]: {
									...existing,
									name,
								},
							},
						}
					})
				}
			})
			.on('onVehicleReset', (message) => {
				const { playerId, position, rotation } = message
				if (playerId !== get().localPlayerId) {
					set((state) => {
						const existing = state.remotePlayers[playerId]
						if (!existing) return state
						return {
							remotePlayers: {
								...state.remotePlayers,
								[playerId]: {
									...existing,
									transform: {
										...existing.transform,
										position,
										rotation,
									},
								},
							},
						}
					})
				}
			})
			.on('onChatMessage', (message) => {
				const { playerId, playerName, text, timestamp } = message
				set((state) => ({
					chatMessages: [
						...state.chatMessages.slice(-49), // Keep last 50 messages
						{
							id: `${playerId}-${timestamp}`,
							playerId,
							playerName,
							text,
							timestamp,
							isLocal: playerId === get().localPlayerId,
						},
					],
				}))
			})
		
		set({ networkManager })
		return networkManager
	},
	
	// Sync remote players from room state (excludes local player)
	syncRemotePlayers: (players) => {
		const localPlayerId = get().localPlayerId
		const remotePlayers = {}
		
		players.forEach((player) => {
			if (player.id !== localPlayerId) {
				remotePlayers[player.id] = player
			}
		})
		
		set({ remotePlayers })
	},
	
	// Connect to server
	connect: async (serverUrl) => {
		let networkManager = get().networkManager
		
		if (!networkManager) {
			networkManager = get().initNetworkManager(serverUrl)
		}
		
		try {
			await networkManager.connect()
			return true
		} catch (error) {
			set({ 
				connectionError: error.message,
				connectionState: ConnectionState.DISCONNECTED,
			})
			return false
		}
	},
	
	// Ensure connected to server (connects if needed, with retry for cold boot)
	ensureConnected: async () => {
		const networkManager = get().networkManager
		if (networkManager?.isConnected()) return true
		
		return get().connect(getServerUrl())
	},
	
	// Disconnect from server
	disconnect: () => {
		const networkManager = get().networkManager
		if (networkManager) {
			networkManager.disconnect()
		}
		
		set({
			currentRoom: null,
			remotePlayers: {},
			localPlayerId: null,
		})
	},
	
	// Join a room, or create one if no roomId provided (auto-connects if needed)
	joinRoom: async (roomId) => {
		const connected = await get().ensureConnected()
		if (!connected) return false
		
		const vehicleConfig = useGameStore.getState().currentVehicle
		return get().networkManager.joinRoom(roomId, get().playerName, vehicleConfig)
	},
	
	// Leave current room
	leaveRoom: () => {
		const networkManager = get().networkManager
		if (networkManager?.isConnected()) {
			networkManager.leaveRoom()
		}
	},
	
	// Send player transform update
	sendPlayerUpdate: (transform) => {
		const networkManager = get().networkManager
		if (networkManager?.isConnected() && get().currentRoom) {
			networkManager.sendPlayerUpdate(transform)
		}
	},
	
	// Send vehicle config update
	sendVehicleConfig: (config) => {
		const networkManager = get().networkManager
		if (networkManager?.isConnected() && get().currentRoom) {
			networkManager.sendVehicleConfig(config)
		}
	},
	
	// Set player name
	setPlayerName: (name) => {
		if (name && name.trim().length > 0) {
			const trimmedName = name.trim().slice(0, 20)
			localStorage.setItem('playerName', trimmedName)
			set({ playerName: trimmedName })
			
			// Send name update to server if in a room
			const networkManager = get().networkManager
			if (networkManager?.isConnected() && get().currentRoom) {
				networkManager.sendPlayerNameUpdate(trimmedName)
			}
		}
	},
	
	// Clear error
	clearError: () => set({ connectionError: null }),
	
	// Chat methods
	sendChatMessage: (text) => {
		const networkManager = get().networkManager
		if (networkManager?.isConnected() && get().currentRoom && text.trim()) {
			networkManager.sendChatMessage(text.trim())
		}
	},
	
	setChatOpen: (open) => set({ chatOpen: open }),
	
	clearChat: () => set({ chatMessages: [] }),
	
	// Get remote player count
	getRemotePlayerCount: () => Object.keys(get().remotePlayers).length,
}))

export default useMultiplayerStore
