import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Vector3, Raycaster } from 'three'

import useGameStore from '../store/gameStore'

// Camera controls and chase cam logic
const CameraControls = ({ followSpeed = 0.1, minGroundDistance = 0.5 }) => {
    const setCameraTargetRef = useGameStore((state) => state.setCameraTargetRef)
    const cameraAutoRotate = useGameStore((state) => state.cameraAutoRotate)

    //const camera = useThree((state) => state.camera)
    const scene = useThree((state) => state.scene)
    const size = useThree((state) => state.size)

    const cameraRef = useRef()
    const targetPosition = useRef(new Vector3(0, 0.95, 0))
    const cameraControlsRef = useRef()

    const raycaster = useRef(new Raycaster())
    const downDirection = useRef(new Vector3(0, -1, 0))
    const cameraPosition = useRef(new Vector3())

    // Determine if the device is in portrait mode
    const isPortrait = useMemo(() => size.width / size.height < 1, [size])

    // Set default camera position based on aspect ratio
    const defaultCameraPosition = isPortrait ? [-2, 1, 12] : [-4, 1, 6.5]

    useEffect(() => {
        // Set the camera target
        setCameraTargetRef(targetPosition)
    }, [targetPosition])

    useFrame(() => {
        if (!cameraControlsRef.current) return

        // Smoothly update the orbit controls target
        cameraControlsRef.current.target.lerp(targetPosition.current, followSpeed)
        cameraControlsRef.current.update()

        // Ground avoidance logic
        cameraRef.current.getWorldPosition(cameraPosition.current)
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
                cameraRef.current.position.y += minGroundDistance - groundDistance
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
            <PerspectiveCamera ref={cameraRef} fov={24} position={defaultCameraPosition} makeDefault />
        </>
    )
}

export default CameraControls
