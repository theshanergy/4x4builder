import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { AudioListener, PositionalAudio } from 'three'
import useGameStore from '../../../store/gameStore'

/**
 * Procedural Drone Audio Engine
 * Synthesizes drone sounds using oscillators (similar to vehicle horn)
 */
class DroneAudioEngine {
	constructor() {
		this.context = null
		this.masterGain = null
		this.oscillators = []
		this.filters = []
		this.isInitialized = false
		this.currentVelocity = 0
	}

	init(outputNode) {
		if (this.isInitialized) return

		if (outputNode && outputNode.context) {
			this.context = outputNode.context
		} else {
			this.context = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' })
		}

		this.masterGain = this.context.createGain()
		this.masterGain.gain.value = 0

		// Connect to the PositionalAudio node
		if (outputNode && outputNode.setNodeSource) {
			outputNode.setNodeSource(this.masterGain)
		} else if (outputNode) {
			this.masterGain.connect(outputNode)
		}

		// Simplified quadcopter sound - 2 oscillators instead of 4
		const oscConfigs = [
			{ type: 'sawtooth', ratio: 1.0, gain: 0.08 }, // Main Motor
			{ type: 'sawtooth', ratio: 1.1, gain: 0.06 }, // Slight detune for richness
		]

		// Single shared filter for efficiency
		const sharedFilter = this.context.createBiquadFilter()
		sharedFilter.type = 'lowpass'
		sharedFilter.frequency.value = 1500
		sharedFilter.Q.value = 0.8
		this.filters.push(sharedFilter)

		oscConfigs.forEach((config) => {
			const osc = this.context.createOscillator()
			osc.type = config.type
			osc.frequency.value = 150 * config.ratio

			const gain = this.context.createGain()
			gain.gain.value = config.gain

			osc.connect(gain)
			gain.connect(sharedFilter)
			osc.start()

			this.oscillators.push({ osc, gain, ratio: config.ratio })
		})

		sharedFilter.connect(this.masterGain)
		this.isInitialized = true
	}

	updateParams(velocity) {
		if (!this.isInitialized || !this.context) return

		const clampedVelocity = Math.min(Math.max(velocity, 0), 50)
		this.currentVelocity = clampedVelocity
		const now = this.context.currentTime

		// Drone pitch range: 200Hz - 800Hz
		const baseFreq = 200 + clampedVelocity * 12

		// Update oscillator frequencies
		this.oscillators.forEach(({ osc, ratio }) => {
			osc.frequency.setTargetAtTime(baseFreq * ratio, now, 0.1)
		})

		// Open filter with speed for high-frequency buzz
		this.filters[0].frequency.setTargetAtTime(1500 + clampedVelocity * 60, now, 0.1)

		// Volume increases with velocity
		const targetVolume = Math.min(0.15 + clampedVelocity * 0.012, 0.5)
		this.masterGain.gain.setTargetAtTime(targetVolume * (useGameStore.getState().muted ? 0 : 1), now, 0.1)
	}

	setVolume(vol) {
		if (this.masterGain && this.context) {
			// Scale by current velocity-based volume
			const velocityVolume = Math.min(0.3 + this.currentVelocity * 0.02, 1.0)
			this.masterGain.gain.setTargetAtTime(vol * velocityVolume, this.context.currentTime, 0.05)
		}
	}

	destroy() {
		// Stop and disconnect all oscillators
		this.oscillators.forEach(({ osc, gain }) => {
			try {
				osc.stop()
			} catch (e) {}
			try {
				osc.disconnect()
			} catch (e) {}
			try {
				gain.disconnect()
			} catch (e) {}
		})
		this.oscillators = []

		// Disconnect filters
		this.filters.forEach((filter) => {
			try {
				filter.disconnect()
			} catch (e) {}
		})
		this.filters = []

		if (this.masterGain) {
			try {
				this.masterGain.disconnect()
			} catch (e) {}
			this.masterGain = null
		}
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

		// Initialize engine
		engine.init(audio)
		const isMuted = useGameStore.getState().muted
		engine.setVolume(isMuted ? 0 : 0.35)

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
			audioEngineRef.current.setVolume(muted ? 0 : 0.35)
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
