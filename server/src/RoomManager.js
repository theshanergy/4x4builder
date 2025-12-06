import settings from '../config/settings.js'

// Generate a random room code
function generateRoomCode() {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Excluded I, O, 0, 1 for readability
	let code = ''
	for (let i = 0; i < settings.roomCodeLength; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return code
}

// Room class
class Room {
	constructor(id, hostId) {
		this.id = id
		this.host = hostId
		this.players = new Map()
		this.createdAt = Date.now()
		this.lastActivity = Date.now()
		this.settings = {
			maxPlayers: settings.maxPlayersPerRoom,
		}
	}
	
	// Add a player to the room
	addPlayer(player) {
		this.players.set(player.id, player)
		player.roomId = this.id
		this.lastActivity = Date.now()
	}
	
	// Remove a player from the room
	removePlayer(playerId) {
		const player = this.players.get(playerId)
		if (player) {
			player.roomId = null
			this.players.delete(playerId)
			this.lastActivity = Date.now()
		}
		
		// If host left, assign new host
		if (playerId === this.host && this.players.size > 0) {
			const newHost = this.players.keys().next().value
			this.host = newHost
		}
	}
	
	// Check if room is full
	isFull() {
		return this.players.size >= this.settings.maxPlayers
	}
	
	// Check if room is empty
	isEmpty() {
		return this.players.size === 0
	}
	
	// Broadcast message to all players except sender
	broadcast(message, excludePlayerId = null) {
		const messageStr = JSON.stringify(message)
		
		this.players.forEach((player, playerId) => {
			if (playerId !== excludePlayerId && player.ws.readyState === 1) {
				player.ws.send(messageStr)
			}
		})
	}
	
	// Broadcast to all players including sender
	broadcastAll(message) {
		const messageStr = JSON.stringify(message)
		
		this.players.forEach((player) => {
			if (player.ws.readyState === 1) {
				player.ws.send(messageStr)
			}
		})
	}
	
	// Get room state for sharing
	getState() {
		const players = []
		this.players.forEach((player) => {
			players.push(player.getPublicData())
		})
		
		return {
			id: this.id,
			host: this.host,
			playerCount: this.players.size,
			maxPlayers: this.settings.maxPlayers,
			players,
		}
	}
}

// Room Manager class
export default class RoomManager {
	constructor() {
		this.rooms = new Map() // roomId -> Room
		this.playerRooms = new Map() // playerId -> roomId
		
		// Start cleanup interval
		this.cleanupInterval = setInterval(() => this.cleanup(), 60000) // Every minute
	}
	
	// Create a new room
	createRoom(hostPlayer) {
		// Check if player is already in a room
		if (this.playerRooms.has(hostPlayer.id)) {
			throw new Error('ALREADY_IN_ROOM')
		}
		
		// Generate unique room code
		let roomId
		let attempts = 0
		do {
			roomId = generateRoomCode()
			attempts++
			if (attempts > 100) {
				throw new Error('Failed to generate room code')
			}
		} while (this.rooms.has(roomId))
		
		// Create room
		const room = new Room(roomId, hostPlayer.id)
		room.addPlayer(hostPlayer)
		
		this.rooms.set(roomId, room)
		this.playerRooms.set(hostPlayer.id, roomId)
		
		console.log(`Room ${roomId} created by player ${hostPlayer.id}`)
		
		return room
	}
	
	// Join an existing room
	joinRoom(roomId, player) {
		// Check if player is already in a room
		if (this.playerRooms.has(player.id)) {
			throw new Error('ALREADY_IN_ROOM')
		}
		
		const room = this.rooms.get(roomId)
		
		if (!room) {
			throw new Error('ROOM_NOT_FOUND')
		}
		
		if (room.isFull()) {
			throw new Error('ROOM_FULL')
		}
		
		room.addPlayer(player)
		this.playerRooms.set(player.id, roomId)
		
		console.log(`Player ${player.id} joined room ${roomId}`)
		
		return room
	}
	
	// Leave current room
	leaveRoom(playerId) {
		const roomId = this.playerRooms.get(playerId)
		if (!roomId) {
			return null
		}
		
		const room = this.rooms.get(roomId)
		if (room) {
			room.removePlayer(playerId)
			
			// Clean up empty rooms
			if (room.isEmpty()) {
				this.rooms.delete(roomId)
				console.log(`Room ${roomId} deleted (empty)`)
			}
		}
		
		this.playerRooms.delete(playerId)
		console.log(`Player ${playerId} left room ${roomId}`)
		
		return room
	}
	
	// Get room by ID
	getRoom(roomId) {
		return this.rooms.get(roomId)
	}
	
	// Get room for player
	getRoomForPlayer(playerId) {
		const roomId = this.playerRooms.get(playerId)
		if (!roomId) return null
		return this.rooms.get(roomId)
	}
	
	// Clean up inactive rooms
	cleanup() {
		const now = Date.now()
		const expiredRooms = []
		
		this.rooms.forEach((room, roomId) => {
			if (now - room.lastActivity > settings.roomTimeout) {
				expiredRooms.push(roomId)
			}
		})
		
		expiredRooms.forEach(roomId => {
			const room = this.rooms.get(roomId)
			if (room) {
				// Notify players
				room.broadcastAll({
					type: 'room_closed',
					reason: 'Room timed out due to inactivity',
				})
				
				// Remove all players from tracking
				room.players.forEach((player) => {
					player.roomId = null
					this.playerRooms.delete(player.id)
				})
				
				this.rooms.delete(roomId)
				console.log(`Room ${roomId} deleted (timeout)`)
			}
		})
	}
	
	// Shutdown
	shutdown() {
		clearInterval(this.cleanupInterval)
		
		// Notify all players and clean up
		this.rooms.forEach((room) => {
			room.broadcastAll({
				type: 'room_closed',
				reason: 'Server shutting down',
			})
		})
		
		this.rooms.clear()
		this.playerRooms.clear()
	}
	
	// Get stats
	getStats() {
		let totalPlayers = 0
		this.rooms.forEach(room => {
			totalPlayers += room.players.size
		})
		
		return {
			roomCount: this.rooms.size,
			playerCount: totalPlayers,
		}
	}
}
