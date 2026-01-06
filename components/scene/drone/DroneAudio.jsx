import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { AudioListener, PositionalAudio } from 'three'
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

	async init(outputNode = null) {
		if (this.isInitialized || this.isInitializing) return
		this.isInitializing = true

		try {
			if (outputNode && outputNode.context) {
				this.context = outputNode.context
			} else {
				this.context = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' })
			}

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
			this.gainNode = this.context.createGain()
			this.gainNode.gain.value = 0.5

			this.workletNode.connect(this.gainNode)
			this.connectOutput(outputNode)
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

	connectOutput(outputNode) {
		if (!this.gainNode) return

		try {
			this.gainNode.disconnect()
		} catch (e) {
			// Ignore disconnect errors
		}

		if (outputNode && outputNode.setNodeSource) {
			outputNode.setNodeSource(this.gainNode)
		} else if (outputNode) {
			this.gainNode.connect(outputNode)
		} else {
			this.gainNode.connect(this.context.destination)
		}
	}

	updateParams(velocity) {
		if (!this.workletNode || !this.context) return

		// Clamp velocity to valid range (0-50) to prevent warnings
		const clampedVelocity = Math.min(Math.max(velocity, 0), 50)

		const now = this.context.currentTime
		this.velocityParam.setTargetAtTime(clampedVelocity, now, 0.1)
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

		// Don't close the context - it may be shared with other audio nodes
		// The context will be cleaned up when the AudioListener is removed
		this.context = null
		this.isInitialized = false
	}
}

/**
 * DroneAudio component
 * Manages drone sound engine and responds to mute state
 * Returns a group containing the audio node for proper positioning
 * @param {Object} props
 * @param {Object} props.velocityRef - Ref to velocity Vector3
 */
const DroneAudio = ({ velocityRef }) => {
	const camera = useThree((state) => state.camera)
	const audioEngineRef = useRef(null)
	const audioRef = useRef(null)
	const groupRef = useRef(null)
	const muted = useGameStore((state) => state.muted)

	// Initialize audio engine
	useEffect(() => {
		const initAudio = async () => {
			// Find or create AudioListener on camera
			let listener = camera.children.find((c) => c.type === 'AudioListener')
			if (!listener) {
				listener = new AudioListener()
				camera.add(listener)
			}

			// Create PositionalAudio node and add to group
			const audio = new PositionalAudio(listener)
			audio.setRefDistance(5)
			if (groupRef.current) {
				groupRef.current.add(audio)
			}
			audioRef.current = audio

			// Create audio engine instance
			const engine = new DroneAudioEngine()
			audioEngineRef.current = engine

			// Initialize engine - at this point audio.context should be available
			try {
				await engine.init(audio)
				const isMuted = useGameStore.getState().muted
				engine.setVolume(isMuted ? 0 : 0.5)
			} catch (e) {
				console.error('Failed to initialize drone audio:', e)
			}
		}

		initAudio()

		return () => {
			try {
				if (audioRef.current?.source) audioRef.current.disconnect()
			} catch (e) {}
			
			if (groupRef.current && audioRef.current) {
				groupRef.current.remove(audioRef.current)
			}

			audioEngineRef.current?.destroy()
			audioEngineRef.current = null
			audioRef.current = null
		}
	}, [camera])

	// Handle mute state changes
	useEffect(() => {
		if (audioEngineRef.current?.isInitialized) {
			audioEngineRef.current.setVolume(muted ? 0 : 0.5)
		}
	}, [muted])

	// Update audio parameters every frame based on velocity
	useFrame(() => {
		if (audioEngineRef.current?.isInitialized && velocityRef) {
			const velocityMagnitude = velocityRef.current.length()
			audioEngineRef.current.updateParams(velocityMagnitude)
		}
	})

	return <group ref={groupRef} />
}

export default DroneAudio
