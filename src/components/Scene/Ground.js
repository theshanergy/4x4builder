import React from 'react'
import { Reflector, useTexture, useDetectGPU } from '@react-three/drei'
import { RepeatWrapping } from 'three'

// Ground.
function Ground() {

    const GPUTier = useDetectGPU()

    // Texture.
    let groundTexture = useTexture('assets/images/ground/ground_tile.png')
    groundTexture.wrapS = RepeatWrapping
    groundTexture.wrapT = RepeatWrapping
    groundTexture.repeat.set(228, 228)

    // Geometry.
    const Geometry = () => {
        return <circleBufferGeometry args={[96, 96]} attach="geometry" />
    }

    // Reflection.
    const Reflection = () => {
        // Disable for low power devices.
        if (GPUTier.tier === "0" || GPUTier.isMobile) return null

        return (
            <Reflector
                textureWidth={2048}
                textureHeight={2048}
                color='#777777'
            >
                <Geometry />
            </Reflector>
        )
    }

    return (
        <object3D name="Ground" rotation-x={-Math.PI / 2}>
            <mesh receiveShadow={true}>
                <Geometry />
                <meshLambertMaterial map={groundTexture} attach="material" color="#aaaaaa" opacity={0.8} transparent={true} />
            </mesh>
            <Reflection />
        </object3D>
    )
}

export default Ground