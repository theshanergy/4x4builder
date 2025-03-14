import React, { useState, useEffect, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera, PerformanceMonitor, KeyboardControls } from '@react-three/drei'
import { DefaultLoadingManager } from 'three'
import { Physics } from '@react-three/rapier'
import Environment from './Environment'
import ChaseCam from './ChaseCam'
import Loader from './Loader'
import Vehicle from './Vehicle'
import Screenshot from './Screenshot'

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
            <Canvas shadows>
                <PerformanceMonitor onDecline={() => setPerformanceDegraded(true)} />

                <ChaseCam target={currentVehicle.ref} autoRotate={cameraAutoRotate} />

                <PerspectiveCamera makeDefault fov={24} position={[-4, 1.5, 6.5]}>
                    <pointLight position={[4, 2, 4]} intensity={0.75} />
                </PerspectiveCamera>

                <KeyboardControls
                    map={[
                        { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
                        { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
                        { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
                        { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
                        { name: 'brake', keys: ['Space'] },
                    ]}>
                    <Physics>
                        <Suspense fallback={null}>
                            <Vehicle currentVehicle={currentVehicle} setVehicle={setVehicle} />
                        </Suspense>

                        <Environment performanceDegraded={performanceDegraded} />
                    </Physics>
                </KeyboardControls>

                <Screenshot />
            </Canvas>
        </div>
    )
}

export default ThreeCanvas
