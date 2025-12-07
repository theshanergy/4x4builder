import settings from '../config/settings.js'

// Public room ID constant
const PUBLIC_ROOM_ID = 'PUBLIC'

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
		this.isPublic = false
		this.settings = {
			maxPlayers: settings.maxPlayersPerRoom,
		}
	}

	// Add a player to the room
	addPlayer(player) {
		this.players.set(player.id, player)
		player.roomId = this.id
		this.lastActivity = Date.now()

		// Assign host if there is none (except PUBLIC room which has no host)
		if (!this.host && this.id !== PUBLIC_ROOM_ID) {
			this.host = player.id
		}
	}

	// Remove a player from the room
	removePlayer(playerId) {
		const player = this.players.get(playerId)
		if (player) {
			player.roomId = null
			this.players.delete(playerId)
			this.lastActivity = Date.now()
		}

		// If host left, assign new host or clear if empty (except PUBLIC room)
		if (playerId === this.host && this.id !== PUBLIC_ROOM_ID) {
			if (this.players.size > 0) {
				const newHost = this.players.keys().next().value
				this.host = newHost
			} else {
				this.host = null
			}
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
			isPublic: this.isPublic,
			players,
		}
	}

	// Get public room info (less detailed)
	getPublicInfo() {
		return {
			id: this.id,
			playerCount: this.players.size,
			maxPlayers: this.settings.maxPlayers,
		}
	}
}

// Room Manager class
export default class RoomManager {
	constructor() {
		this.rooms = new Map() // roomId -> Room
		this.playerRooms = new Map() // playerId -> roomId
		this.onPublicRoomsChange = null // Callback for broadcasting public rooms updates

		// Create the persistent PUBLIC room
		this.createPersistentPublicRoom()

		// Start cleanup interval
		this.cleanupInterval = setInterval(() => this.cleanup(), 60000) // Every minute
	}
	
	// Set callback for broadcasting public rooms updates
	setBroadcastCallback(callback) {
		this.onPublicRoomsChange = callback
	}
	
	// Notify about public rooms change
	notifyPublicRoomsChange() {
		if (this.onPublicRoomsChange) {
			this.onPublicRoomsChange()
		}
	}

	// Create the persistent PUBLIC room (no host, always exists)
	createPersistentPublicRoom() {
		const room = new Room(PUBLIC_ROOM_ID, null)
		room.isPublic = true
		this.rooms.set(PUBLIC_ROOM_ID, room)
		console.log(`Persistent ${PUBLIC_ROOM_ID} room created`)
	}

	// Create a new room (optionally with a specific ID)
	createRoom(hostPlayer, roomId = null) {
		// Check if player is already in a room
		if (this.playerRooms.has(hostPlayer.id)) {
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
		const room = new Room(roomId, hostPlayer.id)
		room.addPlayer(hostPlayer)

		this.rooms.set(roomId, room)
		this.playerRooms.set(hostPlayer.id, roomId)

		console.log(`Room ${roomId} created by player ${hostPlayer.id}`)
		
		// Notify about public rooms change (new room might become public later)
		this.notifyPublicRoomsChange()

		return room
	}

	// Join an existing room, or create it if it doesn't exist
	joinRoom(roomId, player) {
		// Check if player is already in a room
		if (this.playerRooms.has(player.id)) {
			throw new Error('ALREADY_IN_ROOM')
		}

		let room = this.rooms.get(roomId)

		// If room doesn't exist, create it with this player as host
		if (!room) {
			return this.createRoom(player, roomId)
		}

		if (room.isFull()) {
			throw new Error('ROOM_FULL')
		}

		room.addPlayer(player)
		this.playerRooms.set(player.id, roomId)

		console.log(`Player ${player.id} joined room ${roomId}`)
		
		// Notify about public rooms change (player count changed)
		if (room.isPublic) {
			this.notifyPublicRoomsChange()
		}

		return room
	}

	// Leave current room
	leaveRoom(playerId) {
		const roomId = this.playerRooms.get(playerId)
		if (!roomId) {
			return null
		}

		const room = this.rooms.get(roomId)
		const wasPublic = room?.isPublic
		
		if (room) {
			room.removePlayer(playerId)

			// Clean up empty rooms (except PUBLIC which is persistent)
			if (room.isEmpty() && roomId !== PUBLIC_ROOM_ID) {
				this.rooms.delete(roomId)
				console.log(`Room ${roomId} deleted (empty)`)
			}
		}

		this.playerRooms.delete(playerId)
		console.log(`Player ${playerId} left room ${roomId}`)
		
		// Notify about public rooms change (room deleted or player count changed)
		if (wasPublic) {
			this.notifyPublicRoomsChange()
		}

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
			// Never expire the PUBLIC room
			if (roomId === PUBLIC_ROOM_ID) return

			if (now - room.lastActivity > settings.roomTimeout) {
				expiredRooms.push(roomId)
			}
		})

		expiredRooms.forEach((roomId) => {
			const room = this.rooms.get(roomId)
			if (room) {
				const wasPublic = room.isPublic
				
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
				
				// Notify about public rooms change
				if (wasPublic) {
					this.notifyPublicRoomsChange()
				}
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

	// Get list of public rooms
	getPublicRooms() {
		const publicRooms = []
		this.rooms.forEach((room) => {
			if (room.isPublic && !room.isFull()) {
				publicRooms.push(room.getPublicInfo())
			}
		})
		return publicRooms
	}

	// Set room public/private
	setRoomPublic(playerId, isPublic) {
		const roomId = this.playerRooms.get(playerId)
		if (!roomId) {
			throw new Error('NOT_IN_ROOM')
		}

		const room = this.rooms.get(roomId)
		if (!room) {
			throw new Error('ROOM_NOT_FOUND')
		}

		if (room.host !== playerId) {
			throw new Error('NOT_HOST')
		}

		room.isPublic = isPublic
		
		// Notify about public rooms change
		this.notifyPublicRoomsChange()
		
		return room
	}
}
