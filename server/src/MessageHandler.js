import { MessageTypes, ErrorCodes, createMessage } from './types.js'
import Validator from './Validator.js'
import settings from '../config/settings.js'

// Handle incoming messages
export default class MessageHandler {
	constructor(roomManager, wsServer) {
		this.roomManager = roomManager
		this.wsServer = wsServer
	}
	
	// Process a message from a player
	handle(player, message) {
		// Check rate limiting
		if (!player.checkRateLimit()) {
			player.send(createMessage(MessageTypes.ERROR, {
				code: ErrorCodes.RATE_LIMITED,
				message: 'Too many messages, please slow down',
			}))
			return
		}
		
		switch (message.type) {
			case MessageTypes.PING:
				this.handlePing(player, message)
				break
				
			case MessageTypes.JOIN_ROOM:
				this.handleJoinRoom(player, message)
				break
				
			case MessageTypes.LEAVE_ROOM:
				this.handleLeaveRoom(player)
				break
				
			case MessageTypes.PLAYER_UPDATE:
				this.handlePlayerUpdate(player, message)
				break
				
			case MessageTypes.VEHICLE_CONFIG:
				this.handleVehicleConfig(player, message)
				break
				
			case MessageTypes.VEHICLE_RESET:
				this.handleVehicleReset(player, message)
				break
				
			case MessageTypes.PLAYER_NAME_UPDATE:
				this.handlePlayerNameUpdate(player, message)
				break
				
			case MessageTypes.CHAT_MESSAGE:
				this.handleChatMessage(player, message)
				break
				
			default:
				player.send(createMessage(MessageTypes.ERROR, {
					code: ErrorCodes.INVALID_MESSAGE,
					message: `Unknown message type: ${message.type}`,
				}))
		}
	}
	
	// Handle ping
	handlePing(player, message) {
		player.lastPing = Date.now()
		player.send(createMessage(MessageTypes.PONG, {
			clientTime: message.clientTime,
			serverTime: Date.now(),
		}))
	}
	
	// Broadcast lobby info to all connected players (only when public lobby changes)
	broadcastLobbyInfo(roomId) {
		// Only broadcast if the change affects the public lobby
		if (roomId && roomId !== settings.publicLobbyId) {
			return
		}
		
		const stats = this.roomManager.getStats()
		const message = JSON.stringify(createMessage(MessageTypes.LOBBY_INFO, {
			lobbyPlayerCount: stats.lobbyPlayerCount,
		}))
		
		this.wsServer.wss.clients.forEach((client) => {
			if (client.readyState === 1) {
				client.send(message)
			}
		})
	}
	
	// Handle join room (or create if no roomId provided)
	handleJoinRoom(player, message) {
		try {
			const roomId = message.roomId?.toUpperCase() || null
			
			// Validate room code if provided
			if (roomId && !Validator.isValidRoomCode(roomId)) {
				throw new Error('INVALID_ROOM_CODE')
			}
			
			// Set player name if provided
			if (message.playerName) {
				player.setName(message.playerName)
			}
			
			// Set vehicle config if provided
			if (message.vehicleConfig) {
				const validation = Validator.validateVehicleConfig(message.vehicleConfig)
				if (validation.valid) {
					player.updateVehicleConfig(message.vehicleConfig)
				}
			}
			
			// Check if this is a new room (will be created)
			const existingRoom = roomId ? this.roomManager.getRoom(roomId) : null
			const isNewRoom = !existingRoom
			
			const room = this.roomManager.joinRoom(roomId, player)
			
			if (isNewRoom) {
				// Room was created
				player.send(createMessage(MessageTypes.ROOM_JOINED, {
					roomId: room.id,
					roomState: room.getState(),
				}))
			} else {
				// Notify existing players
				room.broadcast(createMessage(MessageTypes.PLAYER_JOINED, {
					player: player.getPublicData(),
				}), player.id)
				
				// Send room state to joining player
				player.send(createMessage(MessageTypes.ROOM_JOINED, {
					roomId: room.id,
					roomState: room.getState(),
				}))
			}
			
			// Broadcast updated lobby count to all connected players
			this.broadcastLobbyInfo(room.id)
		} catch (error) {
			player.send(createMessage(MessageTypes.ERROR, {
				code: error.message,
				message: this.getErrorMessage(error.message),
			}))
		}
	}
	
	// Handle leave room
	handleLeaveRoom(player) {
		const room = this.roomManager.getRoomForPlayer(player.id)
		
		if (!room) {
			player.send(createMessage(MessageTypes.ERROR, {
				code: ErrorCodes.NOT_IN_ROOM,
				message: 'You are not in a room',
			}))
			return
		}
		
		// Notify other players before leaving
		room.broadcast(createMessage(MessageTypes.PLAYER_LEFT, {
			playerId: player.id,
		}), player.id)
		
		this.roomManager.leaveRoom(player.id)
		
		// If room still exists, notify remaining players
		if (!room.isEmpty()) {
			room.broadcastAll(createMessage(MessageTypes.ROOM_STATE, {
				roomState: room.getState(),
			}))
		}
		
		player.send(createMessage(MessageTypes.ROOM_LEFT, {}))
		
		// Broadcast updated lobby count to all connected players
		this.broadcastLobbyInfo(room.id)
	}
	
	// Handle player position/rotation update
	handlePlayerUpdate(player, message) {
		const room = this.roomManager.getRoomForPlayer(player.id)
		
		if (!room) {
			return // Silently ignore if not in room
		}
		
		// Validate update data
		const validation = Validator.validatePlayerUpdate(message)
		if (!validation.valid) {
			return // Silently ignore invalid updates
		}
		
		// Update player state
		player.updateTransform(message)
		
		// Broadcast to other players
		room.broadcast(createMessage(MessageTypes.PLAYER_UPDATE, 
			player.getTransformData()
		), player.id)
	}
	
	// Handle vehicle configuration change
	handleVehicleConfig(player, message) {
		const room = this.roomManager.getRoomForPlayer(player.id)
		
		if (!room) {
			return
		}
		
		// Validate config
		const validation = Validator.validateVehicleConfig(message.config)
		if (!validation.valid) {
			player.send(createMessage(MessageTypes.ERROR, {
				code: ErrorCodes.VALIDATION_ERROR,
				message: 'Invalid vehicle configuration',
				errors: validation.errors,
			}))
			return
		}
		
		// Update player config
		player.updateVehicleConfig(message.config)
		
		// Broadcast to other players
		room.broadcast(createMessage(MessageTypes.VEHICLE_CONFIG, {
			playerId: player.id,
			config: message.config,
		}), player.id)
	}
	
	// Handle vehicle reset
	handleVehicleReset(player, message) {
		const room = this.roomManager.getRoomForPlayer(player.id)
		
		if (!room) {
			return
		}
		
		// Broadcast reset to other players
		room.broadcast(createMessage(MessageTypes.VEHICLE_RESET, {
			playerId: player.id,
			position: message.position,
			rotation: message.rotation,
		}), player.id)
	}
	
	// Handle player name update
	handlePlayerNameUpdate(player, message) {
		const room = this.roomManager.getRoomForPlayer(player.id)
		
		if (!room) {
			return
		}
		
		// Validate and set the new name
		const newName = message.name
		if (typeof newName !== 'string' || newName.trim().length === 0 || newName.length > 20) {
			return // Silently ignore invalid names
		}
		
		player.setName(newName)
		
		// Broadcast to all players including the sender (to confirm the update)
		room.broadcastAll(createMessage(MessageTypes.PLAYER_NAME_UPDATE, {
			playerId: player.id,
			name: player.name,
		}))
	}
	
	// Handle chat message
	handleChatMessage(player, message) {
		const room = this.roomManager.getRoomForPlayer(player.id)
		
		if (!room) {
			return
		}
		
		// Validate chat message
		const text = message.text
		if (typeof text !== 'string' || text.trim().length === 0 || text.length > 200) {
			return // Silently ignore invalid messages
		}
		
		// Broadcast to all players in the room (including sender for confirmation)
		room.broadcastAll(createMessage(MessageTypes.CHAT_MESSAGE, {
			playerId: player.id,
			playerName: player.name,
			text: text.trim(),
			timestamp: Date.now(),
		}))
	}
	
	// Handle player disconnection
	handleDisconnect(player) {
		const room = this.roomManager.getRoomForPlayer(player.id)
		
		if (room) {
			// Notify other players
			room.broadcast(createMessage(MessageTypes.PLAYER_LEFT, {
				playerId: player.id,
			}), player.id)
			
			this.roomManager.leaveRoom(player.id)
			
			// Update room state for remaining players
			if (!room.isEmpty()) {
				room.broadcastAll(createMessage(MessageTypes.ROOM_STATE, {
					roomState: room.getState(),
				}))
			}
			
			// Broadcast updated lobby count to all connected players
			this.broadcastLobbyInfo(room.id)
		}
	}
	
	// Get user-friendly error message
	getErrorMessage(code) {
		switch (code) {
			case 'INVALID_ROOM_CODE':
				return 'Invalid room code. Please enter a valid code.'
			case 'ROOM_NOT_FOUND':
				return 'Room not found. Check the room code and try again.'
			case 'ROOM_FULL':
				return 'Room is full. Try joining a different room.'
			case 'ALREADY_IN_ROOM':
				return 'You are already in a room. Leave first to join another.'
			case 'NOT_IN_ROOM':
				return 'You are not in a room.'
			default:
				return 'An error occurred. Please try again.'
		}
	}
}
