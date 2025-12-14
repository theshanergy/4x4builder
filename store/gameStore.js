import { create } from 'zustand'
import { produce } from 'immer'
import { Vector3 } from 'three'
import vehicleConfigs from '../vehicleConfigs'

// Compatibility shim for legacy localStorage data, mapping old vehicle id field to body
const preprocessVehicleConfig = (config) => {
	if (!config) return config
	const { id, ...rest } = config
	return { ...rest, ...(id && { body: id }) }
}

// Check if device is mobile (touch device or small screen)
const checkIsMobile = () => typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 1024)

// Mutable state for high-frequency data (avoiding store updates/rerenders)
export const vehicleState = {
	speed: 0,
	rpm: 850,
	throttle: 0,
	gear: 1,
	load: 0.2, // Engine load (0 = no load/airborne, 1 = max load/climbing)
	position: new Vector3(0, 0, 0), // Vehicle world position (updated every frame)
	heading: 0, // Vehicle heading/yaw in radians (updated every frame)
}

// Environment state (shared across scene components)
export const sunDirection = new Vector3(0.6, 0.45, 0.5).normalize()

// Game store
const useGameStore = create((set, get) => {
	// Set up resize listener for isMobile detection
	if (typeof window !== 'undefined') {
		window.addEventListener('resize', () => set({ isMobile: checkIsMobile() }))
	}

	return {
		// Game state
		isMobile: checkIsMobile(),
		sceneLoaded: false,
		physicsEnabled: false,
		physicsEnabledOnce: false, // Track if physics has ever been enabled
		performanceDegraded: false,
		controlsVisible: false,
		muted: true, // Audio muted by default
		lightsOn: false, // Vehicle lights state
		infoMode: false, // Info/landing page mode - when true, shows vehicle page with hero

		setSceneLoaded: (loaded) => set({ sceneLoaded: loaded }),
		setInfoMode: (mode) => set({ infoMode: mode }),
		setPhysicsEnabled: (enabled) =>
			set((state) => {
				// Unmute audio the first time physics is enabled
				const shouldUnmute = enabled && !state.physicsEnabledOnce
				return {
					physicsEnabled: enabled,
					physicsEnabledOnce: state.physicsEnabledOnce || enabled,
					...(shouldUnmute && { muted: false }),
				}
			}),
		setPerformanceDegraded: (degraded) => set({ performanceDegraded: degraded }),
		setControlsVisible: (visible) => set({ controlsVisible: visible }),
		toggleMute: () => set((state) => ({ muted: !state.muted })),
		toggleLights: () => set((state) => ({ lightsOn: !state.lightsOn })),

		// Notification state
		notification: null,
		showNotification: (notificationData) => set({ notification: { ...notificationData, id: Date.now() } }),
		hideNotification: () => set({ notification: null }),

		// Camera state
		cameraMode: 'orbit', // 'orbit', 'firstPerson' (extensible for future modes)
		cameraAutoRotate: false,
		setCameraMode: (mode) => set({ cameraMode: mode }),
		setCameraAutoRotate: (autoRotate) => set({ cameraAutoRotate: autoRotate }),

		// XR state
		xrOriginRef: null,
		setXrOriginRef: (ref) => set({ xrOriginRef: ref }),

		// Saved vehicles
		savedVehicles: (() => {
			// Get from local storage or null.
			const localStorageVehicles = localStorage.getItem('savedVehicles')
			const vehicles = localStorageVehicles ? JSON.parse(localStorageVehicles) : { current: null }

			// Normalize all saved configs
			for (const key in vehicles) {
				if (key !== 'current' && vehicles[key]?.config) {
					vehicles[key].config = preprocessVehicleConfig(vehicles[key].config)
				}
			}

			return vehicles
		})(),
		setSavedVehicles: (updater) =>
			set((state) => {
				const newSavedVehicles = typeof updater === 'function' ? updater(state.savedVehicles) : updater
				localStorage.setItem('savedVehicles', JSON.stringify(newSavedVehicles))

				// Force state to reinitialize `currentVehicle`
				return {
					savedVehicles: newSavedVehicles,
					currentVehicle:
						newSavedVehicles.current && newSavedVehicles[newSavedVehicles.current] ? newSavedVehicles[newSavedVehicles.current].config : vehicleConfigs.defaults,
				}
			}),

		// Delete a vehicle from saved vehicles
		deleteSavedVehicle: (vehicleId) => {
			set((state) => {
				const updatedVehicles = { ...state.savedVehicles }
				delete updatedVehicles[vehicleId]

				if (state.savedVehicles.current === vehicleId) {
					const remainingIds = Object.keys(updatedVehicles).filter((key) => key !== 'current')
					updatedVehicles.current = remainingIds[0] || null
				}

				return { savedVehicles: updatedVehicles }
			})

			get().setSavedVehicles((vehicles) => vehicles) // Forces resync with localStorage
		},

		// Current vehicle config
		currentVehicle: (() => {
			const localStorageVehicles = localStorage.getItem('savedVehicles')
			const savedVehicles = localStorageVehicles ? JSON.parse(localStorageVehicles) : { current: null }
			const defaultVehicleId = savedVehicles.current
			const config = defaultVehicleId && savedVehicles[defaultVehicleId] ? savedVehicles[defaultVehicleId].config : vehicleConfigs.defaults

			return preprocessVehicleConfig(config)
		})(),
		setVehicle: (updater) =>
			set(
				produce((state) => {
					// Get previous vehicle id
					const prevBodyId = state.currentVehicle.body

					// Update vehicle state
					if (typeof updater === 'function') {
						updater(state.currentVehicle)
					} else {
						Object.assign(state.currentVehicle, preprocessVehicleConfig(updater))
					}

					// Get new vehicle id
					const newBodyId = state.currentVehicle.body

					// If vehicle body changed, reset addons and lighting
					if (newBodyId !== prevBodyId && updater.body) {
						state.currentVehicle.addons = vehicleConfigs.vehicles[newBodyId]?.default_addons || {}
						state.currentVehicle.lighting = {}
					}
				})
			),
	}
})

export default useGameStore
