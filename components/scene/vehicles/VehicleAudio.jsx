import { memo, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AudioListener, PositionalAudio } from 'three'
import useGameStore, { vehicleState } from '../../../store/gameStore'
import useInputStore from '../../../store/inputStore'
import useMultiplayerStore from '../../../store/multiplayerStore'
import { workletCode } from '../../../hooks/engineWorklet'

// Track which AudioContexts have already registered the worklet processor
const registeredContexts = new WeakSet()

// Cached empty Set to avoid creating new objects in render loop
const EMPTY_SET = new Set()

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

			// Only register the worklet processor if not already registered on this context
			if (!registeredContexts.has(this.context)) {
				// Create worklet from Blob to avoid external file loading issues
				const blob = new Blob([workletCode], { type: 'application/javascript' })
				const url = URL.createObjectURL(blob)

				try {
					await this.context.audioWorklet.addModule(url)
					registeredContexts.add(this.context)
				} finally {
					URL.revokeObjectURL(url)
				}
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
		if (!this.workletNode || !this.context) return

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
		if (this.gainNode && this.context) {
			this.gainNode.gain.setTargetAtTime(vol * 0.5, this.context.currentTime, 0.05)
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

		// Don't close the context - it may be shared with other audio nodes (PositionalAudio)
		// The context will be cleaned up when the AudioListener is removed
		this.context = null
		this.isInitialized = false
	}
}

/**
 * Procedural Horn Engine
 * Synthesizes a dual-tone car horn using oscillators
 */
class HornEngine {
	constructor() {
		this.context = null
		this.masterGain = null
		this.oscillators = []
		this.pendingCleanups = [] // Track pending cleanup timeouts
		this.isInitialized = false
	}

	init(outputNode) {
		if (this.isInitialized) return

		if (outputNode && outputNode.context) {
			this.context = outputNode.context
		} else {
			this.context = new (window.AudioContext || window.webkitAudioContext)()
		}

		this.masterGain = this.context.createGain()
		this.masterGain.gain.value = 0

		// Connect to the PositionalAudio node
		if (outputNode && outputNode.setNodeSource) {
			outputNode.setNodeSource(this.masterGain)
		} else if (outputNode) {
			this.masterGain.connect(outputNode)
		}

		this.isInitialized = true
	}

	play() {
		if (!this.isInitialized) return
		if (this.oscillators.length > 0) return // Already playing

		const now = this.context.currentTime

		// Dual-tone horn frequencies (approx F#4 and A#4)
		const freqs = [370, 440]

		freqs.forEach((freq) => {
			const osc = this.context.createOscillator()
			osc.type = 'sawtooth'
			osc.frequency.value = freq

			// Detune slightly for realism
			osc.detune.value = (Math.random() - 0.5) * 10

			// Filter to soften the harsh sawtooth
			const filter = this.context.createBiquadFilter()
			filter.type = 'lowpass'
			filter.frequency.value = 2000

			const gain = this.context.createGain()
			gain.gain.value = 0.5

			osc.connect(filter)
			filter.connect(gain)
			gain.connect(this.masterGain)

			osc.start(now)
			this.oscillators.push({ osc, filter, gain })
		})

		// Attack envelope
		this.masterGain.gain.cancelScheduledValues(now)
		this.masterGain.gain.setValueAtTime(0, now)
		this.masterGain.gain.linearRampToValueAtTime(0.8, now + 0.05)
	}

	stop() {
		if (!this.isInitialized) return
		if (this.oscillators.length === 0) return

		const now = this.context.currentTime

		// Release envelope
		this.masterGain.gain.cancelScheduledValues(now)
		this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
		this.masterGain.gain.linearRampToValueAtTime(0, now + 0.1)

		// Cleanup oscillators
		this.oscillators.forEach(({ osc, filter, gain }) => {
			osc.stop(now + 0.1)
			const timeoutId = setTimeout(() => {
				try { osc.disconnect() } catch (e) {}
				try { filter.disconnect() } catch (e) {}
				try { gain.disconnect() } catch (e) {}
				// Remove from pending cleanups
				const idx = this.pendingCleanups.indexOf(timeoutId)
				if (idx > -1) this.pendingCleanups.splice(idx, 1)
			}, 150)
			this.pendingCleanups.push(timeoutId)
		})
		this.oscillators = []
	}

	destroy() {
		// Cancel any pending cleanup timeouts
		this.pendingCleanups.forEach(id => clearTimeout(id))
		this.pendingCleanups = []
		
		// Stop and disconnect all oscillators immediately
		this.oscillators.forEach(({ osc, filter, gain }) => {
			try { osc.stop() } catch (e) {}
			try { osc.disconnect() } catch (e) {}
			try { filter.disconnect() } catch (e) {}
			try { gain.disconnect() } catch (e) {}
		})
		this.oscillators = []
		
		if (this.masterGain) {
			try { this.masterGain.disconnect() } catch (e) {}
			this.masterGain = null
		}
		this.context = null
		this.isInitialized = false
	}
}

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
	const hornEngineRef = useRef(null)
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
		engineAudio.setRefDistance(5)
		groupRef.current.add(engineAudio)

		// Create positional audio for horn
		const hornAudio = new PositionalAudio(listener)
		hornAudio.setRefDistance(3)
		groupRef.current.add(hornAudio)
		hornAudioRef.current = hornAudio

		// Create horn engine
		const hornEngine = new HornEngine()
		hornEngineRef.current = hornEngine
		hornEngine.init(hornAudio)

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
			try {
				if (engineAudio.isPlaying) engineAudio.stop()
			} catch (e) {}
			try {
				if (engineAudio.source) engineAudio.disconnect()
			} catch (e) {}

			hornEngine.destroy()
			try {
				if (hornAudio.source) hornAudio.disconnect()
			} catch (e) {}

			if (groupRef.current) {
				groupRef.current.remove(engineAudio)
				groupRef.current.remove(hornAudio)
			}
			engine.destroy()
			audioEngineRef.current = null
			hornAudioRef.current = null
			hornEngineRef.current = null
		}
	}, [physicsEnabled, camera, isRemote])

	// Handle mute state changes
	useEffect(() => {
		const engine = audioEngineRef.current
		if (!engine?.isInitialized) return
		engine.setVolume(muted ? 0 : 0.5)

		// Stop horn if muted
		if (muted) {
			hornEngineRef.current?.stop()
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
				hornEngineRef.current?.stop()
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
		const hornEngine = hornEngineRef.current
		if (!hornEngine) return

		if (action === 'play') {
			hornEngine.play()
		} else if (action === 'stop') {
			hornEngine.stop()
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
			const effectiveKeys = chatOpen ? EMPTY_SET : keys
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
