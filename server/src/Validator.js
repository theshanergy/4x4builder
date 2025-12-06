import settings from '../config/settings.js'

// Input validation functions
export default class Validator {
	// Validate position array
	static isValidPosition(position) {
		if (!Array.isArray(position) || position.length !== 3) {
			return false
		}
		
		return position.every(v => 
			typeof v === 'number' && 
			!isNaN(v) && 
			Math.abs(v) <= settings.maxPositionValue
		)
	}
	
	// Validate quaternion rotation
	static isValidRotation(rotation) {
		if (!Array.isArray(rotation) || rotation.length !== 4) {
			return false
		}
		
		return rotation.every(v => 
			typeof v === 'number' && 
			!isNaN(v) && 
			Math.abs(v) <= 1.1 // Quaternion components should be ~[-1, 1]
		)
	}
	
	// Validate velocity array
	static isValidVelocity(velocity) {
		if (!Array.isArray(velocity) || velocity.length !== 3) {
			return false
		}
		
		return velocity.every(v => 
			typeof v === 'number' && 
			!isNaN(v) && 
			Math.abs(v) <= settings.maxVelocityValue
		)
	}
	
	// Validate angular velocity array
	static isValidAngularVelocity(angularVelocity) {
		if (!Array.isArray(angularVelocity) || angularVelocity.length !== 3) {
			return false
		}
		
		return angularVelocity.every(v => 
			typeof v === 'number' && 
			!isNaN(v) && 
			Math.abs(v) <= 100 // Reasonable angular velocity limit (rad/s)
		)
	}
	
	// Validate wheel rotations array
	static isValidWheelRotations(wheelRotations) {
		if (!Array.isArray(wheelRotations) || wheelRotations.length !== 4) {
			return false
		}
		
		return wheelRotations.every(v => 
			typeof v === 'number' && !isNaN(v)
		)
	}
	
	// Validate player update message
	static validatePlayerUpdate(data) {
		const errors = []
		
		if (data.position && !this.isValidPosition(data.position)) {
			errors.push('Invalid position')
		}
		
		if (data.rotation && !this.isValidRotation(data.rotation)) {
			errors.push('Invalid rotation')
		}
		
		if (data.velocity && !this.isValidVelocity(data.velocity)) {
			errors.push('Invalid velocity')
		}
		
		if (data.angularVelocity && !this.isValidAngularVelocity(data.angularVelocity)) {
			errors.push('Invalid angular velocity')
		}
		
		if (data.wheelRotations && !this.isValidWheelRotations(data.wheelRotations)) {
			errors.push('Invalid wheel rotations')
		}
		
		if (typeof data.steering !== 'undefined' && 
			(typeof data.steering !== 'number' || Math.abs(data.steering) > 1)) {
			errors.push('Invalid steering')
		}
		
		if (typeof data.engineRpm !== 'undefined' &&
			(typeof data.engineRpm !== 'number' || data.engineRpm < 0 || data.engineRpm > 10000)) {
			errors.push('Invalid engine RPM')
		}
		
		return {
			valid: errors.length === 0,
			errors,
		}
	}
	
	// Validate vehicle configuration
	static validateVehicleConfig(config) {
		if (!config || typeof config !== 'object') {
			return { valid: false, errors: ['Config must be an object'] }
		}
		
		const errors = []
		
		// Basic type checks for required fields
		if (typeof config.body !== 'string') {
			errors.push('Invalid body type')
		}
		
		if (typeof config.color !== 'string') {
			errors.push('Invalid color')
		}
		
		// Numeric field validation
		const numericFields = [
			'roughness', 'lift', 'wheel_offset', 'rim_diameter', 
			'rim_width', 'tire_diameter', 'tire_muddiness'
		]
		
		numericFields.forEach(field => {
			if (typeof config[field] !== 'undefined' && typeof config[field] !== 'number') {
				errors.push(`Invalid ${field}`)
			}
		})
		
		return {
			valid: errors.length === 0,
			errors,
		}
	}
	
	// Validate room code format
	static isValidRoomCode(code) {
		if (typeof code !== 'string') return false
		// Room codes are alphanumeric, uppercase, 8 characters
		return /^[A-Z0-9]{8}$/.test(code)
	}
	
	// Validate player name
	static isValidPlayerName(name) {
		if (typeof name !== 'string') return false
		return name.trim().length > 0 && name.length <= 20
	}
}
