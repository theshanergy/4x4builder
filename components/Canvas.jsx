import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, KeyboardControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'

import useGameStore from '../store/gameStore'
import Environment from './Environment'
import CameraControls from './CameraControls'
import Loader from './Loader'
import VehicleManager from './VehicleManager'
import Screenshot from './Screenshot'

const keyMap = [
    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
    { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
    { name: 'brake', keys: ['Space'] },
]

// Canvas component
const ThreeCanvas = () => {
    const physicsEnabled = useGameStore((state) => state.physicsEnabled)
    const setPhysicsEnabled = useGameStore((state) => state.setPhysicsEnabled)
    const setPerformanceDegraded = useGameStore((state) => state.setPerformanceDegraded)

    return (
        <div id='canvas' className='absolute inset-0 overflow-hidden'>
            <Loader />

            <KeyboardControls map={keyMap} onChange={() => !physicsEnabled && setPhysicsEnabled(true)}>
                <Canvas shadows>
                    <PerformanceMonitor onDecline={() => setPerformanceDegraded(true)} />

                    <CameraControls />

                    <Physics paused={!physicsEnabled}>
                        <Suspense fallback={null}>
                            <VehicleManager />
                        </Suspense>

                        <Environment />
                    </Physics>

                    <Screenshot />
                </Canvas>
            </KeyboardControls>
        </div>
    )
}

export default ThreeCanvas
