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
		performanceDegraded: false,
		controlsVisible: false,
		vehicleSpeedRef: { current: 0 }, // Mutable ref to avoid re-renders
		setSceneLoaded: (loaded) => set({ sceneLoaded: loaded }),
		setPhysicsEnabled: (enabled) => set({ physicsEnabled: enabled }),
		setPerformanceDegraded: (degraded) => set({ performanceDegraded: degraded }),
		setControlsVisible: (visible) => set({ controlsVisible: visible }),

		// Notification state
		notification: null,
		showNotification: (notificationData) => set({ notification: { ...notificationData, id: Date.now() } }),
		hideNotification: () => set({ notification: null }),

		// Camera state
		cameraTarget: new Vector3(0, 0, 0),
		cameraControlsRef: null,
		cameraAutoRotate: false,
		setCameraTarget: (x, y, z) => {
			// mutate in place
			useGameStore.getState().cameraTarget.set(x, y, z)
		},
		setCameraControlsRef: (ref) => set({ cameraControlsRef: ref }),
		setCameraAutoRotate: (autoRotate) => set({ cameraAutoRotate: autoRotate }),

		// XR state
		xrOriginRef: null,
		insideVehicle: false,
		setXrOriginRef: (ref) => set({ xrOriginRef: ref }),
		setInsideVehicle: (inside) => set({ insideVehicle: inside }),

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

					// If vehicle body changed, reset addons
					if (newBodyId !== prevBodyId && updater.body) {
						state.currentVehicle.addons = vehicleConfigs.vehicles[newBodyId]?.default_addons || {}
					}
				})
			),

		// Load vehicle from URL parameters
		loadVehicleFromUrl: () => {
			const urlParams = new URLSearchParams(window.location.search)
			const encodedConfig = urlParams.get('config')

			if (encodedConfig) {
				console.log('Loading vehicle from shared url.')
				const jsonString = decodeURIComponent(encodedConfig)
				const config = preprocessVehicleConfig(JSON.parse(jsonString))

				// Overwrite current vehicle from URL parameter
				set({ currentVehicle: config })

				// Clear current saved vehicle
				set((state) => ({
					savedVehicles: {
						...state.savedVehicles,
						current: null,
					},
				}))

				// Clear URL parameters
				window.history.replaceState({}, '', window.location.pathname)

				return true
			}

			return false
		},
	}
})

export default useGameStore
