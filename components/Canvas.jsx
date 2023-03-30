import React, { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Bounds, Environment, AccumulativeShadows, RandomizedLight, PerspectiveCamera } from '@react-three/drei'
import Vehicle from './Vehicle'
import Screenshot from './Screenshot'

export default function ThreeCanvas({ vehicle, setVehicle, saveVehicle, cameraAutoRotate }) {
    const [triggerScreenshot, setTriggerScreenshot] = useState(false)

    return (
        <div id='vehicle'>
            <Canvas shadows>
                <PerspectiveCamera makeDefault fov={24} position={[-4, 1.5, 6]}>
                    <pointLight position={[4, 2, 4]} intensity={0.5} />
                </PerspectiveCamera>

                <OrbitControls autoRotate={cameraAutoRotate} autoRotateSpeed={-0.3} makeDefault minDistance={4} maxDistance={12} maxPolarAngle={Math.PI / 2} />

                <Suspense fallback={null}>
                    <Bounds fit observe damping={6} margin={0.75}>
                        {vehicle.id && <Vehicle vehicle={vehicle} setVehicle={setVehicle} />}
                    </Bounds>
                </Suspense>

                <AccumulativeShadows temporal scale={10}>
                    <RandomizedLight position={[5, 5, -10]} radius={8} />
                </AccumulativeShadows>

                <ambientLight intensity={0.15} />

                <spotLight penumbra={1} position={[-2, 8, 6]} intensity={1} />

                <Environment files={['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']} path={'assets/images/envmap/'} />

                <Screenshot triggerScreenshot={triggerScreenshot} setTriggerScreenshot={setTriggerScreenshot} />
            </Canvas>
            <div id='actions'>
                <button onClick={() => setTriggerScreenshot(true)}>Screenshot</button>
                <button onClick={saveVehicle}>Save</button>
            </div>
        </div>
    )
}
