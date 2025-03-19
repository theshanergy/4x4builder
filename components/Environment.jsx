import { memo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { TextureLoader, EquirectangularReflectionMapping } from 'three'

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
            <EquirectEnvMap file='/assets/images/envmap/gainmap.webp' />

            {/* Terrain */}
            <TerrainManager />
        </>
    )
})

export default SceneEnvironment
