import React from 'react'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useCameraContext } from '../context/CameraContext'
import useChaseCamera from '../hooks/useChaseCamera'

// Component that handles camera controls and chase camera logic
const CameraControls = ({ autoRotate = false }) => {
    const { controlsRef } = useCameraContext()

    // Initialize the chase camera hook
    useChaseCamera({ height: 1, followSpeed: 0.1 })

    return (
        <>
            <OrbitControls
                ref={controlsRef}
                enableDamping
                dampingFactor={0.025}
                minDistance={2}
                maxDistance={16}
                minPolarAngle={Math.PI / 6} // Prevent camera from going below the ground
                maxPolarAngle={Math.PI / 2} // Prevent camera from going above the target
                autoRotate={autoRotate}
                autoRotateSpeed={-0.3}
            />
            <PerspectiveCamera makeDefault fov={24} position={[-4, 1.5, 6.5]}>
                <pointLight position={[4, 2, 4]} intensity={0.75} />
            </PerspectiveCamera>
        </>
    )
}

export default CameraControls
