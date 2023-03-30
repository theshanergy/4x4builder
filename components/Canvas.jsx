import React, { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import Environment from './Environment'

import Vehicle from './Vehicle'
import Screenshot from './Screenshot'

export default function ThreeCanvas({ vehicle, setVehicle, saveVehicle, cameraAutoRotate }) {
    const [triggerScreenshot, setTriggerScreenshot] = useState(false)

    return (
        <div id='vehicle'>
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

                <Suspense fallback={null}>
                    {vehicle.id && <Vehicle vehicle={vehicle} setVehicle={setVehicle} />}
                    <Environment />
                </Suspense>

                <Screenshot triggerScreenshot={triggerScreenshot} setTriggerScreenshot={setTriggerScreenshot} />
            </Canvas>
            <div id='actions'>
                <button onClick={() => setTriggerScreenshot(true)}>Screenshot</button>
                <button onClick={saveVehicle}>Save</button>
            </div>
        </div>
    )
}
