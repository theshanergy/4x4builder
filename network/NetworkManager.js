import { MessageTypes, createMessage } from './protocols.js'

// Default server URL - can be overridden
const DEFAULT_SERVER_URL = 'ws://localhost:8080'

// Connection states
export const ConnectionState = {
	DISCONNECTED: 'disconnected',
	CONNECTING: 'connecting',
	CONNECTED: 'connected',
	RECONNECTING: 'reconnecting',
}

// Network Manager - handles WebSocket connection and message routing
export default class NetworkManager {
	constructor(options = {}) {
		this.serverUrl = options.serverUrl || DEFAULT_SERVER_URL
		this.ws = null
		this.state = ConnectionState.DISCONNECTED
		this.playerId = null
		
		// Reconnection settings
		this.reconnectAttempts = 0
		this.maxReconnectAttempts = options.maxReconnectAttempts || 5
		this.reconnectDelay = options.reconnectDelay || 1000
		this.reconnectTimer = null
		
		// Latency tracking
		this.latency = 0
		this.pingInterval = null
		this.lastPingTime = 0
		
		// Event callbacks
		this.callbacks = {
			onStateChange: null,
			onWelcome: null,
			onError: null,
			onRoomEntered: null,
			onRoomLeft: null,
			onRoomState: null,
			onRoomClosed: null,
			onPlayerJoined: null,
			onPlayerLeft: null,
			onPlayerUpdate: null,
			onVehicleConfig: null,
			onVehicleReset: null,
			onPublicRoomsList: null,
		}
	}
	
	// Set callback
	on(event, callback) {
		if (event in this.callbacks) {
			this.callbacks[event] = callback
		}
		return this
	}
	
	// Remove callback
	off(event) {
		if (event in this.callbacks) {
			this.callbacks[event] = null
		}
		return this
	}
	
	// Connect to server
	connect() {
		if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
			console.log('Already connected or connecting')
			return Promise.resolve()
		}
		
		return new Promise((resolve, reject) => {
			this.setState(ConnectionState.CONNECTING)
			
			try {
				this.ws = new WebSocket(this.serverUrl)
				
				this.ws.onopen = () => {
					console.log('Connected to multiplayer server')
					this.reconnectAttempts = 0
					this.setState(ConnectionState.CONNECTED)
					this.startPingInterval()
					resolve()
				}
				
				this.ws.onclose = (event) => {
					console.log('Disconnected from server:', event.code, event.reason)
					this.stopPingInterval()
					this.handleDisconnect()
				}
				
				this.ws.onerror = (error) => {
					console.error('WebSocket error:', error)
					if (this.state === ConnectionState.CONNECTING) {
						reject(new Error('Failed to connect to server'))
					}
				}
				
				this.ws.onmessage = (event) => {
					this.handleMessage(event.data)
				}
			} catch (error) {
				this.setState(ConnectionState.DISCONNECTED)
				reject(error)
			}
		})
	}
	
	// Disconnect from server
	disconnect() {
		this.stopReconnect()
		this.stopPingInterval()
		
		if (this.ws) {
			this.ws.close(1000, 'Client disconnect')
			this.ws = null
		}
		
		this.playerId = null
		this.setState(ConnectionState.DISCONNECTED)
	}
	
	// Handle disconnection
	handleDisconnect() {
		this.setState(ConnectionState.DISCONNECTED)
		
		// Attempt reconnection if we were previously connected
		if (this.reconnectAttempts < this.maxReconnectAttempts) {
			this.attemptReconnect()
		}
	}
	
	// Attempt to reconnect
	attemptReconnect() {
		this.stopReconnect()
		this.setState(ConnectionState.RECONNECTING)
		
		const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts)
		console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`)
		
		this.reconnectTimer = setTimeout(async () => {
			this.reconnectAttempts++
			try {
				await this.connect()
			} catch (error) {
				console.error('Reconnection failed:', error)
				if (this.reconnectAttempts < this.maxReconnectAttempts) {
					this.attemptReconnect()
				} else {
					console.log('Max reconnection attempts reached')
					this.setState(ConnectionState.DISCONNECTED)
				}
			}
		}, delay)
	}
	
	// Stop reconnection attempts
	stopReconnect() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
	}
	
	// Start ping interval for latency measurement
	startPingInterval() {
		this.pingInterval = setInterval(() => {
			if (this.isConnected()) {
				this.lastPingTime = Date.now()
				this.send({
					type: MessageTypes.PING,
					clientTime: this.lastPingTime,
				})
			}
		}, 5000) // Ping every 5 seconds
	}
	
	// Stop ping interval
	stopPingInterval() {
		if (this.pingInterval) {
			clearInterval(this.pingInterval)
			this.pingInterval = null
		}
	}
	
	// Set state and notify callback
	setState(state) {
		this.state = state
		this.callbacks.onStateChange?.(state)
	}
	
	// Check if connected
	isConnected() {
		return this.ws && this.ws.readyState === WebSocket.OPEN
	}
	
	// Send message to server
	send(message) {
		if (!this.isConnected()) {
			console.warn('Cannot send message: not connected')
			return false
		}
		
		try {
			this.ws.send(JSON.stringify(message))
			return true
		} catch (error) {
			console.error('Failed to send message:', error)
			return false
		}
	}
	
	// Handle incoming message
	handleMessage(data) {
		let message
		try {
			message = JSON.parse(data)
		} catch (error) {
			console.error('Failed to parse message:', error)
			return
		}
		
		switch (message.type) {
			case MessageTypes.WELCOME:
				this.playerId = message.playerId
				this.callbacks.onWelcome?.(message)
				break
				
			case MessageTypes.PONG:
				this.latency = Date.now() - message.clientTime
				break
				
			case MessageTypes.ERROR:
				console.error('Server error:', message)
				this.callbacks.onError?.(message)
				break
				
			case MessageTypes.ROOM_CREATED:
			case MessageTypes.ROOM_JOINED:
				this.callbacks.onRoomEntered?.(message)
				break
				
			case MessageTypes.ROOM_LEFT:
				this.callbacks.onRoomLeft?.(message)
				break
				
			case MessageTypes.ROOM_STATE:
				this.callbacks.onRoomState?.(message)
				break
				
			case MessageTypes.ROOM_CLOSED:
				this.callbacks.onRoomClosed?.(message)
				break
				
			case MessageTypes.PLAYER_JOINED:
				this.callbacks.onPlayerJoined?.(message)
				break
				
			case MessageTypes.PLAYER_LEFT:
				this.callbacks.onPlayerLeft?.(message)
				break
				
			case MessageTypes.PLAYER_UPDATE:
				this.callbacks.onPlayerUpdate?.(message)
				break
				
			case MessageTypes.VEHICLE_CONFIG:
				this.callbacks.onVehicleConfig?.(message)
				break
				
			case MessageTypes.VEHICLE_RESET:
				this.callbacks.onVehicleReset?.(message)
				break
				
			case MessageTypes.PUBLIC_ROOMS_LIST:
				this.callbacks.onPublicRoomsList?.(message)
				break
				
			default:
				console.warn('Unknown message type:', message.type)
		}
	}
	
	// Room actions
	createRoom(playerName, vehicleConfig) {
		return this.send(createMessage(MessageTypes.CREATE_ROOM, {
			playerName,
			vehicleConfig,
		}))
	}
	
	joinRoom(roomId, playerName, vehicleConfig) {
		return this.send(createMessage(MessageTypes.JOIN_ROOM, {
			roomId: roomId.toUpperCase(),
			playerName,
			vehicleConfig,
		}))
	}
	
	leaveRoom() {
		return this.send(createMessage(MessageTypes.LEAVE_ROOM))
	}
	
	// Player update actions
	sendPlayerUpdate(transform) {
		return this.send(createMessage(MessageTypes.PLAYER_UPDATE, transform))
	}
	
	sendVehicleConfig(config) {
		return this.send(createMessage(MessageTypes.VEHICLE_CONFIG, { config }))
	}
	
	sendVehicleReset(position, rotation) {
		return this.send(createMessage(MessageTypes.VEHICLE_RESET, { position, rotation }))
	}
	
	setRoomPublic(isPublic) {
		return this.send(createMessage(MessageTypes.SET_ROOM_PUBLIC, { isPublic }))
	}
	
	getPublicRooms() {
		return this.send(createMessage(MessageTypes.GET_PUBLIC_ROOMS))
	}
	
	// Get current latency
	getLatency() {
		return this.latency
	}
	
	// Get player ID
	getPlayerId() {
		return this.playerId
	}
}
