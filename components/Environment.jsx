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
    const cameraTargetRef = useGameStore((s) => s.cameraTargetRef)
    const lightRef = useRef()

    useFrame(() => {
        if (lightRef.current && cameraTargetRef?.current) {
            const { x, z } = cameraTargetRef.current
            Object.assign(lightRef.current.position, { x: x + 10, y: 10, z: z + 10 })
            lightRef.current.target.position.copy(cameraTargetRef.current)
            lightRef.current.target.updateMatrixWorld()
        }
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
