import React, { createContext, useContext, useRef } from 'react'

// Create a context for sharing camera controls
export const CameraContext = createContext(null)

// Provider component
export const CameraProvider = ({ children }) => {
    const controlsRef = useRef()
    const targetRef = useRef({ x: 0, y: 0, z: 0 })

    return <CameraContext.Provider value={{ controlsRef, targetRef }}>{children}</CameraContext.Provider>
}

// Hook to use the camera context
export const useCameraContext = () => {
    const context = useContext(CameraContext)
    if (!context) {
        throw new Error('useCameraContext must be used within a CameraProvider')
    }
    return context
}
