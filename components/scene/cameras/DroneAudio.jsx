import { useRef, useEffect } from 'react'
import useGameStore from '../../../store/gameStore'
import droneWorklet from '../../../utils/sound/droneWorklet'

// Track which AudioContexts have already registered the worklet processor
const registeredContexts = new WeakSet()

/**
 * Audio engine class for synthesizing drone sounds
 * Uses AudioWorklet for efficient real-time audio generation
 */
class DroneAudioEngine {
	constructor() {
		this.context = null
		this.workletNode = null
		this.gainNode = null
		this.isInitialized = false
		this.isInitializing = false

		// Cached AudioParams
		this.velocityParam = null
		this.altitudeParam = null
	}

	async init() {
		if (this.isInitialized || this.isInitializing) return
		this.isInitializing = true

		try {
			this.context = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' })

			// Only register the worklet processor if not already registered on this context
			if (!registeredContexts.has(this.context)) {
				// Create worklet from Blob to avoid external file loading issues
				const blob = new Blob([droneWorklet], { type: 'application/javascript' })
				const url = URL.createObjectURL(blob)

				try {
					await this.context.audioWorklet.addModule(url)
					registeredContexts.add(this.context)
				} finally {
					URL.revokeObjectURL(url)
				}
			}

			this.workletNode = new AudioWorkletNode(this.context, 'drone-sound-processor', {
				numberOfInputs: 0,
				numberOfOutputs: 1,
				outputChannelCount: [2],
			})

			// Cache parameters for performance
			this.velocityParam = this.workletNode.parameters.get('velocity')
			this.altitudeParam = this.workletNode.parameters.get('altitude')

			this.gainNode = this.context.createGain()
			this.gainNode.gain.value = 0.5

			this.workletNode.connect(this.gainNode).connect(this.context.destination)
			this.isInitialized = true

			if (this.context.state === 'suspended') {
				await this.context.resume()
			}
		} catch (e) {
			console.error('Failed to initialize drone audio:', e)
			this.destroy()
			throw e
		} finally {
			this.isInitializing = false
		}
	}

	updateParams(velocity, altitude) {
		if (!this.workletNode || !this.context) return

		// Clamp velocity to valid range (0-50) to prevent warnings
		const clampedVelocity = Math.min(Math.max(velocity, 0), 50)

		const now = this.context.currentTime
		this.velocityParam.setTargetAtTime(clampedVelocity, now, 0.1)
		this.altitudeParam.setTargetAtTime(altitude, now, 0.1)
	}

	setVolume(vol) {
		if (this.gainNode && this.context) {
			this.gainNode.gain.setTargetAtTime(vol, this.context.currentTime, 0.05)
		}
	}

	destroy() {
		const nodes = ['workletNode', 'gainNode']
		nodes.forEach((nodeName) => {
			try {
				this[nodeName]?.disconnect()
			} catch (e) {
				// Ignore disconnect errors
			}
			this[nodeName] = null
		})

		try {
			this.context?.close()
		} catch (e) {
			// Ignore close errors
		}
		this.context = null
		this.isInitialized = false
	}
}

/**
 * DroneAudio component
 * Manages drone sound engine and responds to mute state
 * @param {Object} props
 * @param {number} props.velocity - Current velocity magnitude
 * @param {number} props.altitude - Current altitude above ground
 */
const DroneAudio = ({ velocity, altitude }) => {
	const audioEngineRef = useRef(null)
	const muted = useGameStore((state) => state.muted)

	// Initialize audio engine
	useEffect(() => {
		const initAudio = async () => {
			if (!audioEngineRef.current) {
				audioEngineRef.current = new DroneAudioEngine()
				try {
					await audioEngineRef.current.init()
				} catch (e) {
					console.error('Failed to initialize drone audio:', e)
				}
			}
		}

		initAudio()

		return () => {
			audioEngineRef.current?.destroy()
			audioEngineRef.current = null
		}
	}, [])

	// Handle mute state changes
	useEffect(() => {
		if (audioEngineRef.current?.isInitialized) {
			audioEngineRef.current.setVolume(muted ? 0 : 0.5)
		}
	}, [muted])

	// Update audio parameters when velocity or altitude changes
	useEffect(() => {
		if (audioEngineRef.current?.isInitialized) {
			audioEngineRef.current.updateParams(velocity, altitude)
		}
	}, [velocity, altitude])

	return null
}

export default DroneAudio
