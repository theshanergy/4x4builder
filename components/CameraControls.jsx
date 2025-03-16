import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Vector3, Raycaster } from 'three'

import useGameStore from '../store/gameStore'

// Camera controls and chase cam logic
const CameraControls = ({ followSpeed = 0.1, minGroundDistance = 0.5 }) => {
    const targetPosition = useGameStore((state) => state.cameraTarget)
    const cameraAutoRotate = useGameStore((state) => state.cameraAutoRotate)

    const { camera, scene } = useThree()
    const cameraControlsRef = useRef()

    const raycaster = useRef(new Raycaster())
    const downDirection = useRef(new Vector3(0, -1, 0))
    const cameraPosition = useRef(new Vector3())

    // Main camera update logic
    useFrame(() => {
        if (!cameraControlsRef.current) return

        // Smoothly update the orbit controls target (the point the camera looks at)
        cameraControlsRef.current.target.lerp(targetPosition, followSpeed)

        // Update controls
        cameraControlsRef.current.update()

        // Ground avoidance logic
        camera.getWorldPosition(cameraPosition.current)
        raycaster.current.set(cameraPosition.current, downDirection.current)

        // Filter for terrain objects
        const terrainObjects = scene.children.filter(
            (obj) => obj.name === 'TerrainManager' || obj.name.includes('Terrain') || (obj.children && obj.children.some((child) => child.name.includes('Terrain')))
        )

        // Get all meshes from terrain objects
        const terrainMeshes = []
        terrainObjects.forEach((obj) => {
            obj.traverse((child) => {
                if (child.isMesh) {
                    terrainMeshes.push(child)
                }
            })
        })

        // Check for intersections with terrain
        const intersects = raycaster.current.intersectObjects(terrainMeshes, true)

        if (intersects.length > 0) {
            // Get the distance to the ground
            const groundDistance = intersects[0].distance

            // If camera is too close to the ground, move it up
            if (groundDistance < minGroundDistance) {
                camera.position.y += minGroundDistance - groundDistance
            }
        }
    })

    return (
        <>
            <OrbitControls
                ref={cameraControlsRef}
                enableDamping
                dampingFactor={0.025}
                minDistance={2}
                maxDistance={16}
                minPolarAngle={Math.PI / 6} // Prevent camera from going below the ground
                maxPolarAngle={Math.PI / 2} // Prevent camera from going above the target
                autoRotate={cameraAutoRotate}
                autoRotateSpeed={-0.3}
            />
            <PerspectiveCamera makeDefault fov={24} position={[-4, 1.5, 6.5]} />
        </>
    )
}

export default CameraControls
