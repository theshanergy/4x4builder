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
    { name: 'forward', keys: ['ArrowUp'] },
    { name: 'backward', keys: ['ArrowDown'] },
    { name: 'left', keys: ['ArrowLeft'] },
    { name: 'right', keys: ['ArrowRight'] },
    { name: 'brake', keys: ['Space'] },
]

// Canvas component
const ThreeCanvas = () => {
    const physicsEnabled = useGameStore((state) => state.physicsEnabled)
    const setPhysicsEnabled = useGameStore((state) => state.setPhysicsEnabled)
    const setPerformanceDegraded = useGameStore((state) => state.setPerformanceDegraded)

    // Handle key press
    const handleKeyPress = (key) => {
        if (key === 'forward' && !physicsEnabled) {
            setPhysicsEnabled(true)
        }
    }

    return (
        <div id='canvas' className='absolute inset-0 overflow-hidden'>
            <Loader />

            <KeyboardControls map={keyMap} onChange={handleKeyPress}>
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
