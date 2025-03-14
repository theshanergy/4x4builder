import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, KeyboardControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'

import useLoadingManager from '../hooks/useLoadingManager'
import useGameStore from '../store/gameStore'
import Environment from './Environment'
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
const ThreeCanvas = () => {
    const sceneLoaded = useGameStore((state) => state.sceneLoaded)
    const setPerformanceDegraded = useGameStore((state) => state.setPerformanceDegraded)

    // Use loading manager
    useLoadingManager()

    return (
        <div id='vehicle'>
            {!sceneLoaded && <Loader />}
            <KeyboardControls map={keyMap}>
                <Canvas shadows>
                    <PerformanceMonitor onDecline={() => setPerformanceDegraded(true)} />

                    <CameraControls />

                    <Physics>
                        <Suspense fallback={null}>
                            <Vehicle />
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
