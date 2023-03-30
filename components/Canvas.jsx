import React, { useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { LoadingManager } from 'three'
import Environment from './Environment'
import Loader from './Loader'
import Vehicle from './Vehicle'
import Screenshot from './Screenshot'

export default function ThreeCanvas({ vehicle, setVehicle, saveVehicle, cameraAutoRotate }) {
    const [isLoaded, setIsLoaded] = useState(false)
    const [triggerScreenshot, setTriggerScreenshot] = useState(false)

    // Set loaded state based on default loading manager.
    useEffect(() => {
        const manager = LoadingManager
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
            <Canvas shadows frameloop='demand'>
                <OrbitControls
                    makeDefault
                    target={[0, 0.95, 0]}
                    minDistance={4}
                    maxDistance={12}
                    maxPolarAngle={Math.PI / 2}
                    autoRotate={cameraAutoRotate}
                    autoRotateSpeed={-0.3}
                />

                <PerspectiveCamera makeDefault fov={24} position={[-4, 1.5, 6.5]}>
                    <pointLight position={[4, 2, 4]} intensity={0.75} />
                </PerspectiveCamera>

                {vehicle.id && <Vehicle vehicle={vehicle} setVehicle={setVehicle} />}

                <Environment />

                <Screenshot triggerScreenshot={triggerScreenshot} setTriggerScreenshot={setTriggerScreenshot} />
            </Canvas>
            <div id='actions'>
                <button onClick={() => setTriggerScreenshot(true)}>Screenshot</button>
                <button onClick={saveVehicle}>Save</button>
            </div>
        </div>
    )
}
