import React, { useEffect, useReducer, useState } from 'react'

import '../assets/styles/global.css'

import vehicleConfigs from '../vehicleConfigs'
import Header from './Header'
import Editor from './Editor'
import Canvas from './Canvas'
import Actions from './Actions'

export default function App() {
    // Current vehicle config.
    const [currentVehicle, setVehicle] = useReducer((currentVehicle, newState) => ({ ...currentVehicle, ...newState }), vehicleConfigs.defaults)

    // Camera.
    const [cameraAutoRotate, setCameraAutoRotate] = useState(false)

    // Run once.
    useEffect(() => {
        // Get config from URL parameters.
        const urlParams = new URLSearchParams(window.location.search)
        const encodedConfig = urlParams.get('config')
        // Existing config.
        if (encodedConfig) {
            console.log('Loading vehicle from url')
            const jsonString = decodeURIComponent(encodedConfig)
            const config = JSON.parse(jsonString)
            // Overwrite current vehicle from URL parameter.
            setVehicle(config)
            // Clear URL parameters.
            window.history.replaceState({}, '', window.location.pathname)
        }
    }, [])

    return (
        <div className='App'>
            <Header />
            <Canvas currentVehicle={currentVehicle} setVehicle={setVehicle} cameraAutoRotate={cameraAutoRotate} />
            <Editor isActive={true} currentVehicle={currentVehicle} setVehicle={setVehicle} cameraAutoRotate={cameraAutoRotate} setCameraAutoRotate={setCameraAutoRotate} />
            <Actions currentVehicle={currentVehicle} />
        </div>
    )
}
