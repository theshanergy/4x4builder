import React, { useState, useEffect, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, KeyboardControls } from '@react-three/drei'
import { DefaultLoadingManager } from 'three'
import { Physics } from '@react-three/rapier'
import Environment from './Environment'
import { CameraProvider } from '../context/CameraContext'
import CameraControls from './CameraControls'
import Loader from './Loader'
import Vehicle from './Vehicle'
import Screenshot from './Screenshot'

const keyMap = [
    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
    { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
    { name: 'brake', keys: ['Space'] },
]

// Canvas component
const ThreeCanvas = ({ currentVehicle, setVehicle, cameraAutoRotate }) => {
    const [isLoaded, setIsLoaded] = useState(false)
    const [performanceDegraded, setPerformanceDegraded] = useState(false)

    // Set loaded state based on default loading manager.
    useEffect(() => {
        const loadingManager = DefaultLoadingManager
        loadingManager.onStart = () => {
            setIsLoaded(false)
        }
        loadingManager.onLoad = () => {
            setIsLoaded(true)
        }

        return () => {
            loadingManager.onStart = null
            loadingManager.onLoad = null
        }
    }, [])

    return (
        <div id='vehicle'>
            {!isLoaded && <Loader />}
            <KeyboardControls map={keyMap}>
                <CameraProvider>
                    <Canvas shadows>
                        <PerformanceMonitor onDecline={() => setPerformanceDegraded(true)} />

                        <CameraControls autoRotate={cameraAutoRotate} />

                        <Physics>
                            <Suspense fallback={null}>
                                <Vehicle currentVehicle={currentVehicle} setVehicle={setVehicle} />
                            </Suspense>

                            <Environment performanceDegraded={performanceDegraded} />
                        </Physics>

                        <Screenshot />
                    </Canvas>
                </CameraProvider>
            </KeyboardControls>
        </div>
    )
}

export default ThreeCanvas
