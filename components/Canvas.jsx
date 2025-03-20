import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { Physics } from '@react-three/rapier'

import useGameStore from '../store/gameStore'
import useInput from '../hooks/useInput'
import Environment from './Environment'
import CameraControls from './CameraControls'
import Loader from './Loader'
import VehicleManager from './VehicleManager'
import Screenshot from './Screenshot'

// Canvas component
const ThreeCanvas = () => {
    const physicsEnabled = useGameStore((state) => state.physicsEnabled)
    const setPerformanceDegraded = useGameStore((state) => state.setPerformanceDegraded)
    
    // Initialize input handling
    useInput()

    return (
        <div id='canvas' className='absolute inset-0 overflow-hidden'>
            <Loader />

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
        </div>
    )
}

export default ThreeCanvas
