import { memo } from 'react'
import { useThree } from '@react-three/fiber'
import { MeshReflectorMaterial, useTexture } from '@react-three/drei'
import { RepeatWrapping } from 'three'

const Ground = memo(() => {
    const { gl } = useThree()

    // Load texture.
    const groundTexture = useTexture('assets/images/ground/ground_tile.png', (texture) => {
        texture.wrapS = texture.wrapT = RepeatWrapping
        texture.repeat.set(228, 228)
        texture.anisotropy = gl.capabilities.getMaxAnisotropy()
    })

    return (
        <mesh name='Ground' rotation-x={-Math.PI / 2} position={[0, -0.0001, 0]}>
            <circleGeometry args={[96, 96]} />
            <MeshReflectorMaterial map={groundTexture} resolution={2048} mirror={0} toneMapped={false} />
        </mesh>
    )
})

export default Ground
