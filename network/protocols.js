// Message type definitions for client-server communication
// Shared between client and server
export const MessageTypes = {
	// Connection
	PING: 'ping',
	PONG: 'pong',
	WELCOME: 'welcome',
	ERROR: 'error',
	
	// Room management
	CREATE_ROOM: 'create_room',
	JOIN_ROOM: 'join_room',
	LEAVE_ROOM: 'leave_room',
	ROOM_CREATED: 'room_created',
	ROOM_JOINED: 'room_joined',
	ROOM_LEFT: 'room_left',
	ROOM_STATE: 'room_state',
	ROOM_CLOSED: 'room_closed',
	SET_ROOM_PUBLIC: 'set_room_public',
	GET_PUBLIC_ROOMS: 'get_public_rooms',
	PUBLIC_ROOMS_LIST: 'public_rooms_list',
	PUBLIC_ROOMS_UPDATE: 'public_rooms_update',
	
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
