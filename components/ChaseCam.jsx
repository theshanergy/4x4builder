import { useRef, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Vector3, Raycaster } from 'three'

// ChaseCam component
const ChaseCam = ({ target, height = 1, damping = 0.95, followSpeed = 0.1, autoRotate = false }) => {
    const { camera, scene, gl } = useThree()

    const controlsRef = useRef()
    const raycaster = useRef(new Raycaster())

    // Direction for ground detection raycasting (pointing down)
    const downDirection = useRef(new Vector3(0, -1, 0))

    // Persistent vectors to avoid creating new objects each frame
    const targetPosition = useRef(new Vector3())
    const cameraTargetPosition = useRef(new Vector3())
    const cameraPosition = useRef(new Vector3())

    // Main camera update logic
    useFrame(() => {
        if (!target || !controlsRef.current) return

        // Get target position based on target type
        if (typeof target?.translation === 'function') {
            // Rapier Rigidbody
            targetPosition.current.set(target.translation().x, target.translation().y + 0.95, target.translation().z)
        } else if (target instanceof THREE.Object3D) {
            // Three.js Object3D
            targetPosition.current.copy(target.position)
        } else {
            // Target is not valid, skip update
            return
        }

        // Smoothly update the orbit controls target (the point the camera looks at)
        // This creates the "drag" effect as the camera target follows the bike
        // Use followSpeed for lerp factor (convert from damping if followSpeed not provided)
        const lerpFactor = followSpeed !== undefined ? followSpeed : 1 - damping
        cameraTargetPosition.current.lerp(targetPosition.current, lerpFactor)
        controlsRef.current.target.copy(cameraTargetPosition.current)

        // Update controls
        controlsRef.current.update()

        // Get current camera position
        camera.getWorldPosition(cameraPosition.current)

        // Cast ray downward from camera to detect ground
        raycaster.current.set(cameraPosition.current, downDirection.current)

        // Filter for terrain objects (all objects with names containing "Terrain")
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
                // Calculate how much to move up
                const adjustmentNeeded = height - groundDistance

                // Move camera up by the adjustment amount
                camera.position.y += adjustmentNeeded
            }
        }
    })

    return (
        <OrbitControls
            ref={controlsRef}
            args={[camera, gl.domElement]}
            enableDamping
            dampingFactor={0.025}
            minDistance={2}
            maxDistance={16}
            minPolarAngle={Math.PI / 6} // Prevent camera from going below the ground
            maxPolarAngle={Math.PI / 2} // Prevent camera from going above the target
            autoRotate={autoRotate}
            autoRotateSpeed={-0.3}
        />
    )
}

export default ChaseCam
