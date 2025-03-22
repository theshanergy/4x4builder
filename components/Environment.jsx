import { memo, useRef } from 'react'
import { useFrame, useThree, useLoader } from '@react-three/fiber'
import { TextureLoader, EquirectangularReflectionMapping } from 'three'

import useGameStore from '../store/gameStore'
import TerrainManager from './TerrainManager'

// Equirectangular environment map
const EquirectEnvMap = () => {
    const texture = useLoader(TextureLoader, '/assets/images/envmap/gainmap.webp')
    texture.mapping = EquirectangularReflectionMapping
    texture.needsUpdate = true

    useThree(({ scene }) => {
        scene.environment = texture
    })

    return null
}

// Camera target light
const TargetLight = () => {
    const lightRef = useRef()

    useFrame(() => {
        const light = lightRef.current
        const cameraTarget = useGameStore.getState().cameraTarget

        if (!light) return
        light.position.set(cameraTarget.x + 10, 10, cameraTarget.z + 10)
        light.target.position.copy(cameraTarget)
        light.target.updateMatrixWorld()
    })

    return <directionalLight ref={lightRef} castShadow intensity={1.5} position={[10, 10, 10]} shadow-camera-far={50} />
}

// Environment component
const SceneEnvironment = memo(() => {
    return (
        <>
            {/* Camera target light */}
            <TargetLight />

            {/* Blue sky */}
            <color attach='background' args={['#b8d9f9']} />

            {/* Distant fog for depth */}
            <fog attach='fog' args={['#b8d9f9', 80, 160]} />

            {/* Environment map for reflections */}
            <EquirectEnvMap />

            {/* Terrain */}
            <TerrainManager />
        </>
    )
})

export default SceneEnvironment
