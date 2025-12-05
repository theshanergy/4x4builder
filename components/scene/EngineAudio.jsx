import { memo, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AudioListener, PositionalAudio } from 'three'
import useGameStore from '../../store/gameStore'
import { workletCode } from '../../hooks/engineWorklet'

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
				// Revoke the blob URL immediately after the module is loaded to prevent memory leak
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
			this.gainNode.gain.value = 0 // Start muted

			// Bass boost for that rumble
			this.bassBoostNode = this.context.createBiquadFilter()
			this.bassBoostNode.type = 'lowshelf'
			this.bassBoostNode.frequency.value = 120
			this.bassBoostNode.gain.value = 8

			// Filter to remove digital harshness
			this.lowpassNode = this.context.createBiquadFilter()
			this.lowpassNode.type = 'lowpass'
			this.lowpassNode.frequency.value = 2000
			this.lowpassNode.Q.value = 0.5

			// Simplified chain: Worklet -> BassBoost -> LPF -> Gain -> Output
			this.workletNode.connect(this.bassBoostNode).connect(this.lowpassNode).connect(this.gainNode)

			this.connectOutput(outputNode)

			this.isInitialized = true

			// Initial resume if needed (browser policy)
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
			// Ignore disconnect errors if not connected
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

		// Open up filter slightly at high RPM
		if (this.lowpassNode) {
			const targetFreq = 1500 + rpm * 0.3
			this.lowpassNode.frequency.setTargetAtTime(targetFreq, now, 0.1)
		}
	}

	setVolume(vol) {
		if (this.gainNode) {
			// Compensate for removed pre-amp by scaling volume
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
				} catch (e) {
					// Ignore disconnect errors
				}
				this[nodeName] = null
			}
		}

		// Clear cached params
		this.rpmParam = null
		this.loadParam = null
		this.throttleParam = null

		if (this.context && this.context.state !== 'closed') {
			try {
				this.context.close()
			} catch (e) {
				// Ignore close errors
			}
		}
		this.context = null
		this.isInitialized = false
	}
}

// Singleton instance
const audioEngine = new AudioEngine()

// Cache the store selectors
const physicsEnabledSelector = (state) => state.physicsEnabled
const mutedSelector = (state) => state.muted

const EngineAudio = memo(() => {
	const camera = useThree((state) => state.camera)
	const physicsEnabled = useGameStore(physicsEnabledSelector)
	const muted = useGameStore(mutedSelector)

	const groupRef = useRef(null)
	const audioRef = useRef(null)
	const engineRef = useRef(null)

	// Initialize positional audio and audio engine
	useEffect(() => {
		if (!physicsEnabled || !groupRef.current) return

		// Find or create AudioListener on camera
		let listener = camera.children.find((c) => c.type === 'AudioListener')
		if (!listener) {
			listener = new AudioListener()
			camera.add(listener)
		}

		// Create positional audio node and add it to the group
		const positionalAudio = new PositionalAudio(listener)
		positionalAudio.setRefDistance(5)
		groupRef.current.add(positionalAudio)
		audioRef.current = positionalAudio

		// Initialize audio engine with positional audio as output
		audioEngine
			.init(positionalAudio)
			.then(() => {
				// Apply current mute state
				const isMuted = useGameStore.getState().muted
				audioEngine.setVolume(isMuted ? 0 : 0.5)

				// Cache engineRef once - it's a mutable object
				engineRef.current = useGameStore.getState().engineRef
			})
			.catch((e) => {
				console.warn('Audio engine initialization failed:', e)
			})

		return () => {
			if (positionalAudio.isPlaying) positionalAudio.stop()
			if (positionalAudio.source) positionalAudio.disconnect()
			if (groupRef.current) groupRef.current.remove(positionalAudio)
		}
	}, [physicsEnabled, camera])

	// Handle mute state changes
	useEffect(() => {
		if (!audioEngine.isInitialized) return
		audioEngine.setVolume(muted ? 0 : 0.5)
	}, [muted])

	// Handle visibility changes
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

	// Update audio parameters each frame
	useFrame(() => {
		if (!audioEngine.isInitialized || !engineRef.current) return

		// Read directly from the mutable engineRef - no store access needed
		audioEngine.updateParams(engineRef.current.rpm || 800, engineRef.current.load || 0.5, engineRef.current.throttle || 0)
	})

	return <group ref={groupRef} />
})

export default EngineAudio
