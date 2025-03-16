import { memo } from 'react'

import { Environment, Sky } from '@react-three/drei'
import TerrainManager from './TerrainManager'

const SceneEnvironment = memo(() => {
    return (
        <>
            {/* Main light */}
            <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />

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
