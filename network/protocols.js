// Message type definitions for client-server communication
// Shared between client and server
export const MessageTypes = {
	// Connection
	PING: 'ping',
	PONG: 'pong',
	WELCOME: 'welcome',
	ERROR: 'error',
	LOBBY_INFO: 'lobby_info',
	
	// Room management
	JOIN_ROOM: 'join_room',
	LEAVE_ROOM: 'leave_room',
	ROOM_JOINED: 'room_joined',
	ROOM_LEFT: 'room_left',
	ROOM_STATE: 'room_state',
	ROOM_CLOSED: 'room_closed',
	
	// Player events
	PLAYER_JOINED: 'player_joined',
	PLAYER_LEFT: 'player_left',
	PLAYER_UPDATE: 'player_update',
	PLAYER_NAME_UPDATE: 'player_name_update',
	
	// Vehicle configuration
	VEHICLE_CONFIG: 'vehicle_config',
	VEHICLE_RESET: 'vehicle_reset',
	
	// Chat
	CHAT_MESSAGE: 'chat_message',
}

// Error codes
export const ErrorCodes = {
	ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
	ROOM_FULL: 'ROOM_FULL',
	ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
	NOT_IN_ROOM: 'NOT_IN_ROOM',
	INVALID_MESSAGE: 'INVALID_MESSAGE',
	RATE_LIMITED: 'RATE_LIMITED',
	VALIDATION_ERROR: 'VALIDATION_ERROR',
}

// Create a message object
export function createMessage(type, payload = {}) {
	return {
		type,
		...payload,
	}
}
