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
	
	// Public rooms list
	publicRooms: [],
	
	// Network manager instance
	networkManager: null,
	
	// Latency
	latency: 0,
	
	// Handler for pushing transforms to vehicles (set by RemoteVehicleManager)
	_pushTransformToVehicle: null,
	
	// Retry interval reference
	_serverCheckRetryInterval: null,
	
	// Check if server is available (with automatic retries)
	checkServerAvailability: async () => {
		// Don't check if already in progress or already available
		if (get().serverCheckInProgress) return get().serverAvailable
		if (get().serverAvailable === true) return true
		
		set({ serverCheckInProgress: true })
		
		const serverUrl = getServerUrl()
		
		const result = await new Promise((resolve) => {
			const ws = new WebSocket(serverUrl)
			let resolved = false
			
			const cleanup = (value) => {
				if (resolved) return
				resolved = true
				clearTimeout(timeout)
				try { ws.close() } catch (e) {}
				resolve(value)
			}
			
			const timeout = setTimeout(() => cleanup(false), 5000)
			
			ws.onopen = () => cleanup(true)
			ws.onerror = () => cleanup(false)
			ws.onclose = () => {
				if (!resolved) cleanup(false)
			}
		})
		
		set({ serverAvailable: result, serverCheckInProgress: false })
		
		// If not available, start retry interval
		if (!result && !get()._serverCheckRetryInterval) {
			const interval = setInterval(() => {
				if (get().serverAvailable === true) {
					clearInterval(interval)
					set({ _serverCheckRetryInterval: null })
				} else {
					get().checkServerAvailability()
				}
			}, 5000)
			set({ _serverCheckRetryInterval: interval })
		}
		
		return result
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
			.on('onRoomEntered', (message) => {
				set({
					currentRoom: message.roomState,
					isHost: message.isHost,
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
			.on('onPublicRoomsList', (message) => {
				set({ publicRooms: message.rooms || [] })
			})
			.on('onPublicRoomsUpdate', (message) => {
				// Auto-update public rooms when server broadcasts changes
				set({ publicRooms: message.rooms || [] })
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
	
	// Set room public/private (host only)
	setRoomPublic: (isPublic) => {
		const networkManager = get().networkManager
		if (networkManager?.isConnected() && get().currentRoom && get().isHost) {
			networkManager.setRoomPublic(isPublic)
		}
	},
	
	// Fetch public rooms list
	fetchPublicRooms: async () => {
		const networkManager = get().networkManager
		if (!networkManager) {
			// Need to connect first to fetch rooms
			const serverUrl = getServerUrl()
			const nm = get().initNetworkManager(serverUrl)
			try {
				await nm.connect()
				nm.getPublicRooms()
			} catch (error) {
				set({ connectionError: error.message })
			}
		} else if (networkManager.isConnected()) {
			networkManager.getPublicRooms()
		} else {
			try {
				await networkManager.connect()
				networkManager.getPublicRooms()
			} catch (error) {
				set({ connectionError: error.message })
			}
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
	
	// Get remote player count
	getRemotePlayerCount: () => Object.keys(get().remotePlayers).length,
	
	// Check if in a room
	isInRoom: () => get().currentRoom !== null,
}))

// Auto-start server availability check
useMultiplayerStore.getState().checkServerAvailability()

export default useMultiplayerStore
