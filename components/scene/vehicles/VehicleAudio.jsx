import { memo, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AudioListener, PositionalAudio, AudioLoader } from 'three'
import useGameStore, { vehicleState } from '../../../store/gameStore'
import useInputStore from '../../../store/inputStore'
import useMultiplayerStore from '../../../store/multiplayerStore'
import { workletCode } from '../../../hooks/engineWorklet'

/**
 * Audio engine class for synthesizing engine sounds
 * Uses AudioWorklet for efficient real-time audio generation
 */
class AudioEngine {
	constructor() {
		this.context = null
		this.workletNode = null
		this.gainNode = null
		this.lowpassNode = null
		this.bassBoostNode = null
		this.isInitialized = false
		this.isInitializing = false

		// Cached AudioParams
		this.rpmParam = null
		this.loadParam = null
		this.throttleParam = null
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

			// Create worklet from Blob to avoid external file loading issues
			const blob = new Blob([workletCode], { type: 'application/javascript' })
			const url = URL.createObjectURL(blob)

			try {
				await this.context.audioWorklet.addModule(url)
			} finally {
				URL.revokeObjectURL(url)
			}

			this.workletNode = new AudioWorkletNode(this.context, 'aerosonic-processor', {
				numberOfInputs: 0,
				numberOfOutputs: 1,
				outputChannelCount: [2],
			})

			// Cache parameters for performance
			this.rpmParam = this.workletNode.parameters.get('rpm')
			this.loadParam = this.workletNode.parameters.get('load')
			this.throttleParam = this.workletNode.parameters.get('throttle')

			this.gainNode = this.context.createGain()
			this.gainNode.gain.value = 0

			// Bass boost for rumble
			this.bassBoostNode = this.context.createBiquadFilter()
			this.bassBoostNode.type = 'lowshelf'
			this.bassBoostNode.frequency.value = 120
			this.bassBoostNode.gain.value = 8

			// Filter to remove digital harshness
			this.lowpassNode = this.context.createBiquadFilter()
			this.lowpassNode.type = 'lowpass'
			this.lowpassNode.frequency.value = 2000
			this.lowpassNode.Q.value = 0.5

			this.workletNode.connect(this.bassBoostNode).connect(this.lowpassNode).connect(this.gainNode)
			this.connectOutput(outputNode)
			this.isInitialized = true

			if (this.context.state === 'suspended') {
				await this.context.resume()
			}
		} catch (e) {
			console.error('Failed to initialize audio engine:', e)
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

	updateParams(rpm, load, throttle) {
		if (!this.workletNode) return

		const now = this.context.currentTime
		this.rpmParam.setTargetAtTime(Math.max(rpm, 100), now, 0.1)
		this.loadParam.setTargetAtTime(load, now, 0.05)
		this.throttleParam.setTargetAtTime(throttle, now, 0.05)

		if (this.lowpassNode) {
			const targetFreq = 1500 + rpm * 0.3
			this.lowpassNode.frequency.setTargetAtTime(targetFreq, now, 0.1)
		}
	}

	setVolume(vol) {
		if (this.gainNode) {
			this.gainNode.gain.setTargetAtTime(vol * 0.3, this.context.currentTime, 0.05)
		}
	}

	suspend() {
		this.context?.suspend()
	}

	resume() {
		this.context?.resume()
	}

	destroy() {
		const nodes = ['workletNode', 'bassBoostNode', 'lowpassNode', 'gainNode']

		for (const nodeName of nodes) {
			if (this[nodeName]) {
				try {
					this[nodeName].disconnect()
				} catch (e) {}
				this[nodeName] = null
			}
		}

		this.rpmParam = null
		this.loadParam = null
		this.throttleParam = null

		if (this.context && this.context.state !== 'closed') {
			try {
				this.context.close()
			} catch (e) {}
		}
		this.context = null
		this.isInitialized = false
	}
}

// Shared horn buffer (loaded once, used by all vehicles)
let sharedHornBuffer = null
let hornBufferLoading = false
const hornBufferCallbacks = []

function loadHornBuffer(callback) {
	if (sharedHornBuffer) {
		callback(sharedHornBuffer)
		return
	}

	hornBufferCallbacks.push(callback)

	if (!hornBufferLoading) {
		hornBufferLoading = true
		const audioLoader = new AudioLoader()
		audioLoader.load('/assets/audio/horn.wav', (buffer) => {
			sharedHornBuffer = buffer
			hornBufferCallbacks.forEach((cb) => cb(buffer))
			hornBufferCallbacks.length = 0
		})
	}
}

// Pre-load horn buffer at module initialization (non-blocking)
loadHornBuffer(() => {})

// Cache selectors
const physicsEnabledSelector = (state) => state.physicsEnabled
const mutedSelector = (state) => state.muted

// Mutable horn state for cross-component communication (avoids store updates in render loop)
export const hornState = { active: false }

/**
 * VehicleAudio - Handles all audio for a vehicle (engine + horn)
 * Works for both local player (reads from stores/vehicleState) and remote players (uses props)
 *
 * @param {boolean} isRemote - Whether this is a remote player's vehicle
 * @param {Function} getRemoteState - For remote vehicles: () => { rpm, hornActive }
 */
const VehicleAudio = memo(({ isRemote = false, getRemoteState = null }) => {
	const camera = useThree((state) => state.camera)
	const physicsEnabled = useGameStore(physicsEnabledSelector)
	const muted = useGameStore(mutedSelector)

	const groupRef = useRef(null)
	const audioEngineRef = useRef(null)
	const hornAudioRef = useRef(null)
	const hornReadyRef = useRef(false)
	const lastHornState = useRef(false)
	const pendingHornAction = useRef(null) // Deferred horn play/stop

	// Initialize audio on mount
	useEffect(() => {
		// Remote vehicles don't need physics to be enabled
		if (!isRemote && !physicsEnabled) return
		if (!groupRef.current) return

		// Find or create AudioListener on camera
		let listener = camera.children.find((c) => c.type === 'AudioListener')
		if (!listener) {
			listener = new AudioListener()
			camera.add(listener)
		}

		// Create positional audio for engine
		const engineAudio = new PositionalAudio(listener)
		engineAudio.setRefDistance(isRemote ? 8 : 5)
		groupRef.current.add(engineAudio)

		// Create positional audio for horn
		const hornAudio = new PositionalAudio(listener)
		hornAudio.setRefDistance(15)
		hornAudio.setVolume(0.8)
		hornAudio.setLoop(true)
		groupRef.current.add(hornAudio)
		hornAudioRef.current = hornAudio

		// Load shared horn buffer
		loadHornBuffer((buffer) => {
			if (hornAudioRef.current) {
				hornAudioRef.current.setBuffer(buffer)
				hornReadyRef.current = true
			}
		})

		// Create audio engine instance (each vehicle gets its own)
		const engine = new AudioEngine()
		audioEngineRef.current = engine

		engine
			.init(engineAudio)
			.then(() => {
				const isMuted = useGameStore.getState().muted
				engine.setVolume(isMuted ? 0 : 0.5)
			})
			.catch((e) => {
				console.warn('Audio engine initialization failed:', e)
			})

		return () => {
			if (engineAudio.isPlaying) engineAudio.stop()
			if (engineAudio.source) engineAudio.disconnect()
			if (hornAudio.isPlaying) hornAudio.stop()
			if (hornAudio.source) hornAudio.disconnect()
			if (groupRef.current) {
				groupRef.current.remove(engineAudio)
				groupRef.current.remove(hornAudio)
			}
			engine.destroy()
			audioEngineRef.current = null
			hornAudioRef.current = null
			hornReadyRef.current = false
		}
	}, [physicsEnabled, camera, isRemote])

	// Handle mute state changes
	useEffect(() => {
		const engine = audioEngineRef.current
		if (!engine?.isInitialized) return
		engine.setVolume(muted ? 0 : 0.5)

		// Stop horn if muted
		if (muted && hornAudioRef.current?.isPlaying) {
			hornAudioRef.current.stop()
		}
	}, [muted])

	// Handle visibility changes (local player only)
	useEffect(() => {
		if (isRemote) return

		const handleVisibilityChange = () => {
			const engine = audioEngineRef.current
			if (!engine) return

			const isMuted = useGameStore.getState().muted
			if (document.hidden) {
				engine.setVolume(0)
				engine.suspend()
				if (hornAudioRef.current?.isPlaying) {
					hornAudioRef.current.stop()
				}
			} else {
				engine.resume()
				engine.setVolume(isMuted ? 0 : 0.5)
			}
		}

		document.addEventListener('visibilitychange', handleVisibilityChange)
		return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
	}, [isRemote])

	// Process any pending horn actions (deferred from previous frame to avoid blocking render)
	const processPendingHornAction = () => {
		const action = pendingHornAction.current
		if (!action) return
		
		pendingHornAction.current = null
		const hornAudio = hornAudioRef.current
		if (!hornAudio || !hornReadyRef.current) return
		
		if (action === 'play' && !hornAudio.isPlaying) {
			hornAudio.play()
		} else if (action === 'stop' && hornAudio.isPlaying) {
			hornAudio.stop()
		}
	}

	// Update audio each frame
	useFrame(() => {
		const engine = audioEngineRef.current
		if (!engine?.isInitialized) return

		// Process deferred horn action from previous frame
		processPendingHornAction()

		const isMuted = useGameStore.getState().muted
		let rpm, load, throttle, hornActive

		if (isRemote && getRemoteState) {
			// Remote vehicle: get state from callback
			const state = getRemoteState()
			rpm = state.rpm || 850
			load = 0.3 // Estimate for remote vehicles
			throttle = rpm > 1000 ? 0.5 : 0 // Estimate based on RPM
			hornActive = state.hornActive || false
		} else {
			// Local vehicle: read from mutable state and input stores
			rpm = vehicleState.rpm || 800
			load = vehicleState.load || 0.5
			throttle = vehicleState.throttle || 0

			// Poll horn input directly (no re-renders)
			const { keys, input } = useInputStore.getState()
			const chatOpen = useMultiplayerStore.getState().chatOpen
			const effectiveKeys = chatOpen ? new Set() : keys
			hornActive = effectiveKeys.has('h') || input.leftBumper

			// Update mutable state for network broadcast (avoids Zustand update in render loop)
			if (hornActive !== lastHornState.current) {
				hornState.active = hornActive
			}
		}

		// Update engine audio
		engine.updateParams(rpm, load, throttle)

		// Handle horn state changes - defer audio operations to next frame
		if (hornActive !== lastHornState.current) {
			lastHornState.current = hornActive

			if (!isMuted) {
				// Schedule horn action for next frame to avoid blocking current render
				pendingHornAction.current = hornActive ? 'play' : 'stop'
			}
		}
	})

	return <group ref={groupRef} />
})

export default VehicleAudio
