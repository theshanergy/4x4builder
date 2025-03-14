import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, Raycaster } from 'three'
import { useCameraContext } from '../context/CameraContext'

/**
 * Hook for camera that follows a target with smooth movement and ground avoidance
 * Must be used inside a component that is a child of the Canvas
 * @param {Object} options - Configuration options
 * @param {number} [options.height=1] - Minimum height above ground
 * @param {number} [options.followSpeed=0.1] - Speed at which camera follows target
 */
const useChaseCamera = ({ height = 1, followSpeed = 0.1 } = {}) => {
    const { camera, scene } = useThree()
    const { controlsRef, targetRef } = useCameraContext()

    const raycaster = useRef(new Raycaster())
    const downDirection = useRef(new Vector3(0, -1, 0))
    const cameraPosition = useRef(new Vector3())
    const targetPosition = useRef(new Vector3())

    // Main camera update logic
    useFrame(() => {
        if (!controlsRef.current) return

        // Get the target position from the context
        if (targetRef.current) {
            targetPosition.current.set(targetRef.current.x, targetRef.current.y, targetRef.current.z)
        }

        // Smoothly update the orbit controls target (the point the camera looks at)
        controlsRef.current.target.lerp(targetPosition.current, followSpeed)

        // Update controls
        controlsRef.current.update()

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
            if (groundDistance < height) {
                camera.position.y += height - groundDistance
            }
        }
    })
}

export default useChaseCamera
