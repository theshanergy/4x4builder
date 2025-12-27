import settings from '../config/settings.js'

// Player state class
export default class Player {
	constructor(id, ws) {
		this.id = id
		this.ws = ws
		this.roomId = null
		this.name = `Player ${id.slice(0, 4)}`
		
		// Vehicle configuration
		this.vehicleConfig = null
		
		// Transform state
		this.transform = {
			position: [0, 1, 0],
			rotation: [0, 0, 0, 1],
			velocity: [0, 0, 0],
			angularVelocity: [0, 0, 0],
		}
		
		// Wheel state
		this.wheelRotations = [0, 0, 0, 0]
		this.wheelYPositions = [0, 0, 0, 0]
		this.steering = 0
		this.engineRpm = 850
		this.hornActive = false
		
		// Connection state
		this.lastUpdate = Date.now()
		this.lastPing = Date.now()
		this.latency = 0
		
		// Rate limiting
		this.messageCount = 0
		this.messageWindowStart = Date.now()
	}
	
	// Update player transform
	updateTransform(data) {
		if (data.position) this.transform.position = data.position
		if (data.rotation) this.transform.rotation = data.rotation
		if (data.velocity) this.transform.velocity = data.velocity
		if (data.angularVelocity) this.transform.angularVelocity = data.angularVelocity
		if (data.wheelRotations) this.wheelRotations = data.wheelRotations
		if (data.wheelYPositions) this.wheelYPositions = data.wheelYPositions
		if (typeof data.steering === 'number') this.steering = data.steering
		if (typeof data.engineRpm === 'number') this.engineRpm = data.engineRpm
		if (typeof data.hornActive === 'boolean') this.hornActive = data.hornActive
		this.lastUpdate = Date.now()
	}
	
	// Update vehicle configuration
	updateVehicleConfig(config) {
		this.vehicleConfig = config
		this.lastUpdate = Date.now()
	}
	
	// Set player name
	setName(name) {
		if (typeof name === 'string' && name.length > 0 && name.length <= 20) {
			this.name = name.trim()
		}
	}
	
	// Check rate limiting
	checkRateLimit() {
		const now = Date.now()
		
		// Reset window if needed
		if (now - this.messageWindowStart > settings.rateLimitWindow) {
			this.messageCount = 0
			this.messageWindowStart = now
		}
		
		this.messageCount++
		return this.messageCount <= settings.maxMessagesPerSecond
	}
	
	// Send message to player
	send(message) {
		if (this.ws.readyState === 1) { // WebSocket.OPEN
			this.ws.send(JSON.stringify(message))
		}
	}
	
	// Get public player data (for other players)
	getPublicData() {
		return {
			id: this.id,
			name: this.name,
			vehicleConfig: this.vehicleConfig,
			transform: this.transform,
			wheelRotations: this.wheelRotations,
			wheelYPositions: this.wheelYPositions,
			steering: this.steering,
			engineRpm: this.engineRpm,
			hornActive: this.hornActive,
			lastUpdate: this.lastUpdate,
		}
	}
	
	// Get transform update data
	getTransformData() {
		return {
			playerId: this.id,
			position: this.transform.position,
			rotation: this.transform.rotation,
			velocity: this.transform.velocity,
			angularVelocity: this.transform.angularVelocity,
			wheelRotations: this.wheelRotations,
			wheelYPositions: this.wheelYPositions,
			steering: this.steering,
			engineRpm: this.engineRpm,
			hornActive: this.hornActive,
			timestamp: this.lastUpdate,
		}
	}
}
