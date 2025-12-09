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
	constructor(id) {
		this.id = id
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

	// Create a new room (optionally with a specific ID)
	createRoom(player, roomId = null) {
		// Check if player is already in a room
		if (this.playerRooms.has(player.id)) {
			throw new Error('ALREADY_IN_ROOM')
		}

		if (roomId) {
			// Check if specified room already exists
			if (this.rooms.has(roomId)) {
				throw new Error('ROOM_EXISTS')
			}
		} else {
			// Generate unique room code
			let attempts = 0
			do {
				roomId = generateRoomCode()
				attempts++
				if (attempts > 100) {
					throw new Error('Failed to generate room code')
				}
			} while (this.rooms.has(roomId))
		}

		// Create room
		const room = new Room(roomId)
		room.addPlayer(player)

		this.rooms.set(roomId, room)
		this.playerRooms.set(player.id, roomId)

		console.log(`Room ${roomId} created by player ${player.id}`)

		return room
	}

	// Join an existing room, or create one if roomId is null/doesn't exist
	joinRoom(roomId, player) {
		// Check if player is already in a room
		if (this.playerRooms.has(player.id)) {
			throw new Error('ALREADY_IN_ROOM')
		}

		// If no roomId provided, create a new room
		if (!roomId) {
			return this.createRoom(player)
		}

		let room = this.rooms.get(roomId)

		// If room doesn't exist, create it with the specified ID
		if (!room) {
			return this.createRoom(player, roomId)
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

		expiredRooms.forEach((roomId) => {
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
		this.rooms.forEach((room) => {
			totalPlayers += room.players.size
		})

		return {
			roomCount: this.rooms.size,
			playerCount: totalPlayers,
		}
	}
}
