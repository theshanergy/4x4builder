import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import useGameStore from '../store/gameStore'
import { workletCode } from './engineWorklet'

class AudioEngine {
	constructor() {
		this.context = null
		this.workletNode = null
		this.gainNode = null
		this.analyzer = null
		this.compressor = null
		this.lowpassNode = null
		this.isInitialized = false
	}

	async init() {
		if (this.isInitialized) return

		this.context = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' })

		// Create worklet from Blob to avoid external file loading issues
		const blob = new Blob([workletCode], { type: 'application/javascript' })
		const url = URL.createObjectURL(blob)

		try {
			await this.context.audioWorklet.addModule(url)
		} catch (e) {
			console.error('Failed to load worklet', e)
			throw e
		} finally {
			// Revoke the blob URL immediately after the module is loaded to prevent memory leak
			URL.revokeObjectURL(url)
		}

		this.workletNode = new AudioWorkletNode(this.context, 'aerosonic-processor', {
			numberOfInputs: 0,
			numberOfOutputs: 1,
			outputChannelCount: [2],
		})

		this.gainNode = this.context.createGain()
		this.gainNode.gain.value = 0 // Start muted by default

		this.analyzer = this.context.createAnalyser()
		this.analyzer.fftSize = 2048
		this.analyzer.smoothingTimeConstant = 0.5

		this.compressor = this.context.createDynamicsCompressor()
		this.compressor.threshold.value = -12
		this.compressor.knee.value = 30
		this.compressor.ratio.value = 8
		this.compressor.attack.value = 0.01
		this.compressor.release.value = 0.25

		// Filter to remove digital harshness (The "Ray Gun" sizzle)
		this.lowpassNode = this.context.createBiquadFilter()
		this.lowpassNode.type = 'lowpass'
		this.lowpassNode.frequency.value = 4000 // Roll off high frequencies
		this.lowpassNode.Q.value = 0.5

		// Chain: Worklet -> LPF -> Compressor -> Gain -> Analyzer -> Destination
		this.workletNode.connect(this.lowpassNode).connect(this.compressor).connect(this.gainNode).connect(this.analyzer).connect(this.context.destination)

		this.isInitialized = true

		// Initial resume if needed (browser policy)
		if (this.context.state === 'suspended') {
			await this.context.resume()
		}
	}

	updateParams(state) {
		if (!this.workletNode) return

		const { rpm, load, throttle } = state
		const params = this.workletNode.parameters

		const now = this.context.currentTime

		// Smooth transitions for mechanics
		params.get('rpm').setTargetAtTime(Math.max(rpm, 100), now, 0.1)
		params.get('load').setTargetAtTime(load, now, 0.05)
		params.get('throttle').setTargetAtTime(throttle, now, 0.05)

		// Open up filter slightly at high RPM
		if (this.lowpassNode) {
			const targetFreq = 3000 + rpm * 0.5 // Opens up to ~7000Hz at redline
			this.lowpassNode.frequency.setTargetAtTime(targetFreq, now, 0.1)
		}
	}

	setGeometry(geometry) {
		if (!this.workletNode) return

		// Send geometry via message port
		this.workletNode.port.postMessage({
			type: 'UPDATE_GEOMETRY',
			payload: geometry,
		})

		const params = this.workletNode.parameters
		const now = this.context.currentTime
		params.get('displacement').setTargetAtTime(geometry.displacement, now, 0.2)
		params.get('resonance').setTargetAtTime(geometry.exhaustLength, now, 0.2)
	}

	setVolume(vol) {
		if (this.gainNode) {
			this.gainNode.gain.setTargetAtTime(vol, this.context.currentTime, 0.05)
		}
	}

	getAnalyzer() {
		return this.analyzer
	}

	suspend() {
		this.context?.suspend()
	}

	resume() {
		this.context?.resume()
	}

	destroy() {
		if (this.workletNode) {
			this.workletNode.disconnect()
			this.workletNode = null
		}
		if (this.lowpassNode) {
			this.lowpassNode.disconnect()
			this.lowpassNode = null
		}
		if (this.compressor) {
			this.compressor.disconnect()
			this.compressor = null
		}
		if (this.gainNode) {
			this.gainNode.disconnect()
			this.gainNode = null
		}
		if (this.analyzer) {
			this.analyzer.disconnect()
			this.analyzer = null
		}
		if (this.context) {
			this.context.close()
			this.context = null
		}
		this.isInitialized = false
	}
}

export const audioEngine = new AudioEngine()

// Cache the store selector to avoid recreating on every render
const physicsEnabledSelector = (state) => state.physicsEnabled
const mutedSelector = (state) => state.muted

// Cache engineRef reference once - it's a mutable object that never changes reference
let cachedEngineRef = null

export const useEngineAudio = () => {
	const physicsEnabled = useGameStore(physicsEnabledSelector)
	const muted = useGameStore(mutedSelector)
	const isRunningRef = useRef(false)

	useEffect(() => {
		if (physicsEnabled && !audioEngine.isInitialized) {
			audioEngine.init().then(() => {
				// Set default geometry - could be pulled from vehicle config later
				audioEngine.setGeometry({
					cylinders: 8,
					displacement: 5.0,
					exhaustLength: 1.5,
				})
				// Apply current mute state
				const isMuted = useGameStore.getState().muted
				audioEngine.setVolume(isMuted ? 0 : 0.5)
				isRunningRef.current = true
				// Cache engineRef once - it's a mutable object
				cachedEngineRef = useGameStore.getState().engineRef
			})
		}
	}, [physicsEnabled])

	// Handle mute state changes
	useEffect(() => {
		if (!audioEngine.isInitialized) return
		audioEngine.setVolume(muted ? 0 : 0.5)
	}, [muted])

	useEffect(() => {
		const handleVisibilityChange = () => {
			const isMuted = useGameStore.getState().muted
			if (document.hidden) {
				audioEngine.setVolume(0)
				audioEngine.suspend()
			} else {
				audioEngine.resume()
				audioEngine.setVolume(isMuted ? 0 : 0.5)
			}
		}

		document.addEventListener('visibilitychange', handleVisibilityChange)
		return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
	}, [])

	useFrame(() => {
		if (!audioEngine.isInitialized || !cachedEngineRef) return

		// Read directly from the mutable engineRef - no store access needed
		audioEngine.updateParams({
			rpm: cachedEngineRef.rpm || 800,
			load: cachedEngineRef.load || 0.5,
			throttle: cachedEngineRef.throttle || 0,
		})
	})

	return {
		initAudio: () => audioEngine.init(),
		resumeAudio: () => audioEngine.resume(),
		isRunning: isRunningRef,
	}
}

export default useEngineAudio
