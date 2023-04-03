import React, { useEffect, useReducer, useState } from 'react'

import vehicleConfigs from '../vehicleConfigs'
import Header from './Header'
import Editor from './Editor'
import Canvas from './Canvas'
import Actions from './Actions'
import VehicleTitle from './VehicleTitle'

export default function App() {
    // Saved vehicles.
    const [savedVehicles, setSavedVehicles] = useState(() => {
        // Get from local storage or null.
        const localStorageVehicles = localStorage.getItem('savedVehicles')
        return localStorageVehicles ? JSON.parse(localStorageVehicles) : { current: null }
    })

    // On saved Vehicles update.
    useEffect(() => {
        // Update local storage.
        localStorage.setItem('savedVehicles', JSON.stringify(savedVehicles))
    }, [savedVehicles])

    // Load default vehicle from local storage (if it exists).
    const defaultVehicleConfig = () => {
        // Get current save.
        const defaultVehicleId = savedVehicles.current
        return defaultVehicleId && savedVehicles[defaultVehicleId] ? savedVehicles[defaultVehicleId].config : vehicleConfigs.defaults
    }

    // Current vehicle config.
    const [currentVehicle, setVehicle] = useReducer((currentVehicle, newState) => ({ ...currentVehicle, ...newState }), defaultVehicleConfig())

    // Camera.
    const [cameraAutoRotate, setCameraAutoRotate] = useState(false)

    // Run once.
    useEffect(() => {
        // Get config from URL parameters.
        const urlParams = new URLSearchParams(window.location.search)
        const encodedConfig = urlParams.get('config')
        // Existing config.
        if (encodedConfig) {
            console.log('Loading vehicle from shared url.')
            const jsonString = decodeURIComponent(encodedConfig)
            const config = JSON.parse(jsonString)
            // Overwrite current vehicle from URL parameter.
            setVehicle(config)
            // Clear current saved vehicle.
            setSavedVehicles((prevSavedVehicles) => ({
                ...prevSavedVehicles,
                current: null,
            }))
            // Clear URL parameters.
            window.history.replaceState({}, '', window.location.pathname)
        }
    }, [])

    return (
        <div className='App'>
            <Header>
                <VehicleTitle savedVehicles={savedVehicles} setSavedVehicles={setSavedVehicles} setVehicle={setVehicle} />
            </Header>
            <Canvas currentVehicle={currentVehicle} setVehicle={setVehicle} cameraAutoRotate={cameraAutoRotate} />
            <Editor isActive={true} currentVehicle={currentVehicle} setVehicle={setVehicle} cameraAutoRotate={cameraAutoRotate} setCameraAutoRotate={setCameraAutoRotate} />
            <Actions currentVehicle={currentVehicle} savedVehicles={savedVehicles} setSavedVehicles={setSavedVehicles} />
        </div>
    )
}
