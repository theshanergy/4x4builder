import { memo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { TextureLoader, EquirectangularReflectionMapping } from 'three'
import { Sky } from '@react-three/drei'

import useGameStore from '../store/gameStore'
import TerrainManager from './TerrainManager'

// Equirectangular environment map
const EquirectEnvMap = ({ file }) => {
    const { scene } = useThree()

    useEffect(() => {
        const loader = new TextureLoader()
        loader.load(file, (texture) => {
            texture.mapping = EquirectangularReflectionMapping
            texture.needsUpdate = true
            scene.environment = texture
        })
    }, [file, scene])

    return null
}

// User following light
const UserFollow = () => {
    const cameraTargetRef = useGameStore((state) => state.cameraTargetRef)

    // Refs for light and sky
    const lightRef = useRef()

    // Update position on each frame
    useFrame(() => {
        if (lightRef.current && cameraTargetRef?.current) {
            lightRef.current.position.set(cameraTargetRef.current.x + 10, 10, cameraTargetRef.current.z + 10)
            lightRef.current.target.position.copy(cameraTargetRef.current)
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
            <EquirectEnvMap file='/assets/images/envmap/gainmap.webp' />

            {/* Terrain */}
            <TerrainManager />
        </>
    )
})

export default SceneEnvironment
