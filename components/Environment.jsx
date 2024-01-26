import { Environment, AccumulativeShadows, RandomizedLight } from '@react-three/drei'
import { BackSide } from 'three'
import Ground from './Ground'

export default function SceneEnvironment({ performanceDegraded }) {
    return (
        <>
            <mesh name='Sky'>
                <boxGeometry args={[256, 256, 256]} />
                <meshBasicMaterial color={0xffffff} side={BackSide} toneMapped={false} />
            </mesh>

            <ambientLight intensity={0.5} />

            <Environment files={['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']} path={'assets/images/envmap/'} />

            <Ground />

            {!performanceDegraded && (
                <AccumulativeShadows temporal scale={10}>
                    <RandomizedLight position={[5, 5, -10]} radius={8} />
                </AccumulativeShadows>
            )}
        </>
    )
}
