import { create } from 'zustand'
import { produce } from 'immer'
import { useRef } from 'react'
import { Vector3 } from 'three'
import vehicleConfigs from '../vehicleConfigs'

const useGameStore = create((set, get) => {
    return {
        // Game state
        sceneLoaded: false,
        physicsEnabled: false,
        performanceDegraded: false,
        setSceneLoaded: (loaded) => set({ sceneLoaded: loaded }),
        setPhysicsEnabled: (enabled) => set({ physicsEnabled: enabled }),
        setPerformanceDegraded: (degraded) => set({ performanceDegraded: degraded }),
        
        // Input refs
        inputRefs: null,
        setInputRefs: (refs) => set({ inputRefs: refs }),

        // Notification state
        notification: null,
        showNotification: (notificationData) => set({ notification: { ...notificationData, id: Date.now() } }),
        hideNotification: () => set({ notification: null }),

        // Camera state
        cameraTargetRef: null,
        cameraControlsRef: null,
        cameraAutoRotate: false,
        setCameraTargetRef: (ref) => set({ cameraTargetRef: ref }),
        setCameraControlsRef: (ref) => set({ cameraControlsRef: ref }),
        setCameraAutoRotate: (autoRotate) => set({ cameraAutoRotate: autoRotate }),

        // Saved vehicles
        savedVehicles: (() => {
            // Get from local storage or null.
            const localStorageVehicles = localStorage.getItem('savedVehicles')
            return localStorageVehicles ? JSON.parse(localStorageVehicles) : { current: null }
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
            // Get current save.
            const localStorageVehicles = localStorage.getItem('savedVehicles')
            const savedVehicles = localStorageVehicles ? JSON.parse(localStorageVehicles) : { current: null }
            const defaultVehicleId = savedVehicles.current
            return defaultVehicleId && savedVehicles[defaultVehicleId] ? savedVehicles[defaultVehicleId].config : vehicleConfigs.defaults
        })(),
        setVehicle: (updater) =>
            set(
                produce((state) => {
                    // Get previous vehicle id
                    const prevId = state.currentVehicle.id

                    // Update vehicle state
                    if (typeof updater === 'function') {
                        updater(state.currentVehicle)
                    } else {
                        Object.assign(state.currentVehicle, updater)
                    }

                    // Get new vehicle id
                    const newId = state.currentVehicle.id

                    // If vehicle body changed, reset addons
                    if (newId !== prevId && updater.id) {
                        state.currentVehicle.addons = vehicleConfigs.vehicles[newId]?.default_addons || {}
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
                const config = JSON.parse(jsonString)

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
