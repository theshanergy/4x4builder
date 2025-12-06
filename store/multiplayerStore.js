import { create } from 'zustand'
import NetworkManager, { ConnectionState } from '../network/NetworkManager.js'

// Default server URL - uses environment variable if available
const getServerUrl = () => {
	if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MULTIPLAYER_SERVER_URL) {
		return import.meta.env.VITE_MULTIPLAYER_SERVER_URL
	}
	// Default to localhost for development
	return 'ws://localhost:8080'
}

// Multiplayer store
const useMultiplayerStore = create((set, get) => ({
	// Server availability
	serverAvailable: null, // null = not checked, true = available, false = unavailable
	serverCheckInProgress: false,
	
	// Connection state
	connectionState: ConnectionState.DISCONNECTED,
	connectionError: null,
	
	// Player identity
	localPlayerId: null,
	playerName: localStorage.getItem('playerName') || 'Driver',
	
	// Room state
	currentRoom: null,
	isHost: false,
	
	// Remote players (Map-like object: playerId -> playerState)
	remotePlayers: {},
	
	// Network manager instance
	networkManager: null,
	
	// Latency
	latency: 0,
	
	// Handler for pushing transforms to vehicles (set by RemoteVehicleManager)
	_pushTransformToVehicle: null,
	
	// Check if server is available
	checkServerAvailability: async () => {
		// Don't check if already in progress
		if (get().serverCheckInProgress) return get().serverAvailable
		
		set({ serverCheckInProgress: true })
		
		const serverUrl = getServerUrl()
		
		return new Promise((resolve) => {
			const ws = new WebSocket(serverUrl)
			const timeout = setTimeout(() => {
				ws.close()
				set({ serverAvailable: false, serverCheckInProgress: false })
				resolve(false)
			}, 3000) // 3 second timeout
			
			ws.onopen = () => {
				clearTimeout(timeout)
				ws.close()
				set({ serverAvailable: true, serverCheckInProgress: false })
				resolve(true)
			}
			
			ws.onerror = () => {
				clearTimeout(timeout)
				set({ serverAvailable: false, serverCheckInProgress: false })
				resolve(false)
			}
		})
	},
	
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
			.on('onRoomCreated', (message) => {
				set({
					currentRoom: message.roomState,
					isHost: message.isHost,
					connectionError: null,
				})
				// Initialize remote players from room state
				get().syncRemotePlayers(message.roomState.players)
			})
			.on('onRoomJoined', (message) => {
				set({
					currentRoom: message.roomState,
					isHost: message.isHost,
					connectionError: null,
				})
				// Initialize remote players from room state
				get().syncRemotePlayers(message.roomState.players)
			})
			.on('onRoomLeft', () => {
				set({
					currentRoom: null,
					isHost: false,
					remotePlayers: {},
				})
			})
			.on('onRoomState', (message) => {
				set({
					currentRoom: message.roomState,
					isHost: message.roomState.host === get().localPlayerId,
				})
				get().syncRemotePlayers(message.roomState.players)
			})
			.on('onRoomClosed', (message) => {
				set({
					currentRoom: null,
					isHost: false,
					remotePlayers: {},
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
			set({ connectionError: error.message })
			return false
		}
	},
	
	// Disconnect from server
	disconnect: () => {
		const networkManager = get().networkManager
		if (networkManager) {
			networkManager.disconnect()
		}
		
		set({
			currentRoom: null,
			isHost: false,
			remotePlayers: {},
			localPlayerId: null,
		})
	},
	
	// Create a room
	createRoom: async (vehicleConfig) => {
		const networkManager = get().networkManager
		if (!networkManager?.isConnected()) {
			set({ connectionError: 'Not connected to server' })
			return false
		}
		
		return networkManager.createRoom(get().playerName, vehicleConfig)
	},
	
	// Join a room
	joinRoom: async (roomId, vehicleConfig) => {
		const networkManager = get().networkManager
		if (!networkManager?.isConnected()) {
			set({ connectionError: 'Not connected to server' })
			return false
		}
		
		return networkManager.joinRoom(roomId, get().playerName, vehicleConfig)
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
		}
	},
	
	// Clear error
	clearError: () => set({ connectionError: null }),
	
	// Get remote player count
	getRemotePlayerCount: () => Object.keys(get().remotePlayers).length,
	
	// Check if in a room
	isInRoom: () => get().currentRoom !== null,
}))

export default useMultiplayerStore
