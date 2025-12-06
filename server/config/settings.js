// Server configuration settings
export default {
	// Server
	port: process.env.PORT || 8080,
	
	// Room settings
	maxPlayersPerRoom: 8,
	roomCodeLength: 8,
	roomTimeout: 30 * 60 * 1000, // 30 minutes of inactivity
	
	// Rate limiting
	maxMessagesPerSecond: 30,
	rateLimitWindow: 1000, // 1 second
	
	// Connection settings
	pingInterval: 10000, // 10 seconds
	connectionTimeout: 30000, // 30 seconds without pong
	
	// Validation
	maxPositionValue: 10000, // Max absolute position value
	maxVelocityValue: 500, // Max absolute velocity value
}
