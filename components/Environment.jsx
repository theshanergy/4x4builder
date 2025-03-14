import { Environment, AccumulativeShadows, RandomizedLight } from '@react-three/drei'
import { BackSide } from 'three'
import Ground from './Ground'
import TerrainManager from './TerrainManager'

const PHYSICS = true

export default function SceneEnvironment({ performanceDegraded }) {
    return (
        <>
            <ambientLight intensity={0.5} />

            <mesh name='Sky'>
                <boxGeometry args={[256, 256, 256]} />
                <meshBasicMaterial color={0xffffff} side={BackSide} toneMapped={false} />
            </mesh>

            <Environment files={['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']} path={'assets/images/envmap/'} />

            {PHYSICS ? (
                <TerrainManager />
            ) : (
                <>
                    <Ground />

                    {!performanceDegraded && (
                        <AccumulativeShadows temporal scale={10}>
                            <RandomizedLight position={[5, 5, -10]} radius={8} />
                        </AccumulativeShadows>
                    )}
                </>
            )}
        </>
    )
}
