import React, { useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, PerformanceMonitor } from '@react-three/drei'
import { DefaultLoadingManager } from 'three'
import Environment from './Environment'
import Loader from './Loader'
import Vehicle from './Vehicle'
import Screenshot from './Screenshot'

const ThreeCanvas = ({ currentVehicle, setVehicle, saveVehicle, cameraAutoRotate }) => {
    const [isLoaded, setIsLoaded] = useState(false)
    const [performanceDegraded, setPerformanceDegraded] = useState(false)
    const [triggerScreenshot, setTriggerScreenshot] = useState(false)

    // Set loaded state based on default loading manager.
    useEffect(() => {
        const manager = DefaultLoadingManager
        manager.onLoad = () => {
            setIsLoaded(true)
        }

        return () => {
            manager.onLoad = null
        }
    }, [])

    return (
        <div id='vehicle'>
            {!isLoaded && <Loader />}
            <Canvas shadows>
                <PerformanceMonitor onDecline={() => setPerformanceDegraded(true)} />

                <OrbitControls
                    makeDefault
                    target={[0, 0.95, 0]}
                    minDistance={4}
                    maxDistance={12}
                    maxPolarAngle={Math.PI / 2}
                    autoRotate={cameraAutoRotate}
                    autoRotateSpeed={-0.3}
                    dampingFactor={0.025}
                />

                <PerspectiveCamera makeDefault fov={24} position={[-4, 1.5, 6.5]}>
                    <pointLight position={[4, 2, 4]} intensity={0.75} />
                </PerspectiveCamera>

                <Vehicle currentVehicle={currentVehicle} setVehicle={setVehicle} />

                <Environment performanceDegraded={performanceDegraded} />

                <Screenshot triggerScreenshot={triggerScreenshot} setTriggerScreenshot={setTriggerScreenshot} />
            </Canvas>
            <div id='actions'>
                <button onClick={() => setTriggerScreenshot(true)}>Screenshot</button>
                <button onClick={saveVehicle}>Save</button>
            </div>
        </div>
    )
}

export default ThreeCanvas
