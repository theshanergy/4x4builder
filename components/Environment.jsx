import { memo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment, Sky } from '@react-three/drei'

import useGameStore from '../store/gameStore'
import TerrainManager from './TerrainManager'

// User following light
const UserFollow = () => {
    const targetPosition = useGameStore((state) => state.cameraTarget)

    // Refs for light and sky
    const lightRef = useRef()

    // Update position on each frame
    useFrame(() => {
        if (lightRef.current && targetPosition) {
            lightRef.current.position.set(targetPosition.x + 10, 10, targetPosition.z + 10)
            lightRef.current.target.position.copy(targetPosition)
            lightRef.current.target.updateMatrixWorld()
        }
    })

    return (
        <>
            {/* Main light (updates dynamically) */}
            <directionalLight ref={lightRef} castShadow intensity={1.5} position={[10, 10, 10]} shadow-camera-far={50} />
        </>
    )
}

// Environment component
const SceneEnvironment = memo(() => {
    return (
        <>
            {/* User following */}
            <UserFollow />

            {/* Blue sky */}
            <Sky distance={450000} sunPosition={[10, 5, 10]} inclination={0.49} azimuth={0.25} rayleigh={0.5} />

            {/* Distant fog for depth */}
            <fog attach='fog' args={['#b8d9f9', 80, 160]} />

            {/* Environment map for reflections */}
            <Environment files={['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']} path={'assets/images/envmap/'} />

            {/* Terrain */}
            <TerrainManager />
        </>
    )
})

export default SceneEnvironment
