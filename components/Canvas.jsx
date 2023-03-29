import React, { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Bounds, useTexture, Environment, MeshReflectorMaterial } from '@react-three/drei'
import { RepeatWrapping } from 'three'
import Vehicle from './Vehicle'
import Screenshot from './Screenshot'

// Ground.
const Ground = () => {
    const groundTexture = useTexture('assets/images/ground/ground_tile.png', (texture) => {
        texture.wrapS = texture.wrapT = RepeatWrapping
        texture.repeat.set(228, 228)
    })

    return (
        <mesh name='Ground' rotation-x={-Math.PI / 2} receiveShadow>
            <circleGeometry args={[96, 96]} />
            <MeshReflectorMaterial map={groundTexture} resolution={2048} />
        </mesh>
    )
}

export default function ThreeCanvas({ vehicle, setVehicle, saveVehicle, cameraAutoRotate }) {
    const [triggerScreenshot, setTriggerScreenshot] = useState(false)

    return (
        <div id='vehicle'>
            <Canvas shadows camera={{ position: [6, 2, 6], fov: 24 }}>
                <Suspense fallback={null}>
                    <Bounds fit observe damping={6} margin={0.75}>
                        {vehicle.id && <Vehicle vehicle={vehicle} setVehicle={setVehicle} />}
                    </Bounds>
                </Suspense>

                <Ground />

                <ambientLight intensity={0.15} />

                <fog attach='fog' args={['#fff', 10, 100]} />

                <pointLight position={[3, 2, 3]} intensity={0.5} />

                <spotLight penumbra={1} position={[6, 2, 6]} intensity={1} shadow-mapSize={1024} />

                <Environment files={['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']} path={'assets/images/envmap/'} />

                <OrbitControls autoRotate={cameraAutoRotate} autoRotateSpeed={-0.3} makeDefault minDistance={4} maxDistance={12} maxPolarAngle={Math.PI / 2} />

                <Screenshot triggerScreenshot={triggerScreenshot} setTriggerScreenshot={setTriggerScreenshot} />
            </Canvas>
            <div id='actions'>
                <button onClick={() => setTriggerScreenshot(true)}>Screenshot</button>
                <button onClick={saveVehicle}>Save</button>
            </div>
        </div>
    )
}
