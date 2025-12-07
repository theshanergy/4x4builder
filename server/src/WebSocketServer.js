import { WebSocketServer as WSServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import settings from '../config/settings.js'
import Player from './Player.js'
import RoomManager from './RoomManager.js'
import MessageHandler from './MessageHandler.js'
import { parseMessage, createMessage, MessageTypes } from './types.js'

export default class WebSocketServer {
	constructor(server) {
		this.wss = new WSServer({ server })
		this.players = new Map() // playerId -> Player
		this.roomManager = new RoomManager()
		this.messageHandler = new MessageHandler(this.roomManager, this)
		
		// Set broadcast callback on room manager
		this.roomManager.setBroadcastCallback(() => this.broadcastPublicRoomsUpdate())
		
		this.setupConnectionHandler()
		this.setupPingInterval()
		
		console.log('WebSocket server initialized')
	}
	
	setupConnectionHandler() {
		this.wss.on('connection', (ws, req) => {
			const playerId = uuidv4()
			const player = new Player(playerId, ws)
			this.players.set(playerId, player)
			
			console.log(`Player connected: ${playerId} (${this.players.size} total)`)
			
			// Send welcome message with player ID
			player.send(createMessage(MessageTypes.WELCOME, {
				playerId: playerId,
				serverTime: Date.now(),
			}))
			
			// Handle incoming messages
			ws.on('message', (data) => {
				try {
					const { message, error } = parseMessage(data.toString())
					
					if (error) {
						player.send(createMessage(MessageTypes.ERROR, {
							code: 'INVALID_MESSAGE',
							message: error,
						}))
						return
					}
					
					this.messageHandler.handle(player, message)
				} catch (err) {
					console.error(`Error processing message from ${playerId}:`, err)
				}
			})
			
			// Handle disconnect
			ws.on('close', () => {
				this.handleDisconnect(playerId)
			})
			
			// Handle errors
			ws.on('error', (error) => {
				console.error(`WebSocket error for player ${playerId}:`, error.message)
			})
		})
	}
	
	setupPingInterval() {
		this.pingInterval = setInterval(() => {
			const now = Date.now()
			
			this.players.forEach((player, playerId) => {
				// Check for stale connections
				if (now - player.lastPing > settings.connectionTimeout) {
					console.log(`Player ${playerId} timed out`)
					player.ws.close()
					return
				}
				
				// Send server ping to measure latency
				if (player.ws.readyState === 1) {
					player.ws.ping()
				}
			})
		}, settings.pingInterval)
	}
	
	handleDisconnect(playerId) {
		const player = this.players.get(playerId)
		
		if (player) {
			this.messageHandler.handleDisconnect(player)
			this.players.delete(playerId)
			console.log(`Player disconnected: ${playerId} (${this.players.size} total)`)
		}
	}
	
	// Get server stats
	getStats() {
		return {
			...this.roomManager.getStats(),
			totalConnections: this.players.size,
		}
	}
	
	// Broadcast public rooms update to all connected players not in a room
	broadcastPublicRoomsUpdate() {
		const publicRooms = this.roomManager.getPublicRooms()
		const message = JSON.stringify(createMessage(MessageTypes.PUBLIC_ROOMS_UPDATE, {
			rooms: publicRooms,
		}))
		
		this.players.forEach((player) => {
			// Only send to players not in a room
			if (!player.roomId && player.ws.readyState === 1) {
				player.ws.send(message)
			}
		})
	}
	
	// Graceful shutdown
	shutdown() {
		console.log('Shutting down WebSocket server...')
		
		clearInterval(this.pingInterval)
		this.roomManager.shutdown()
		
		// Close all connections
		this.wss.clients.forEach((ws) => {
			ws.close()
		})
		
		this.wss.close()
	}
}
