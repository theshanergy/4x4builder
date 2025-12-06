import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Vector3, Raycaster, MathUtils } from 'three'

import useGameStore, { vehicleState } from '../../store/gameStore'

// Camera controls and chase cam logic
const CameraControls = ({ followSpeed = 8, minGroundDistance = 0.5 }) => {
	const cameraAutoRotate = useGameStore((state) => state.cameraAutoRotate)

	const camera = useThree((state) => state.camera)
	const scene = useThree((state) => state.scene)

	const cameraControlsRef = useRef()

	const raycaster = useRef(new Raycaster())
	const downDirection = useRef(new Vector3(0, -1, 0))
	const cameraPosition = useRef(new Vector3())
	const terrainMeshesCache = useRef([])
	const lastTerrainCacheFrame = useRef(0)
	const TERRAIN_CACHE_INTERVAL = 60 // Refresh terrain mesh cache every 60 frames

	useFrame((state, delta) => {
		if (!cameraControlsRef.current) return

		// Get the target position from vehicleState
		const target = vehicleState.position
		const controlsTarget = cameraControlsRef.current.target

		// Use damp for frame-rate independent smoothing (prevents micro-banding)
		controlsTarget.x = MathUtils.damp(controlsTarget.x, target.x, followSpeed, delta)
		controlsTarget.y = MathUtils.damp(controlsTarget.y, target.y + 0.95, followSpeed, delta) // Y offset to look at cabin level
		controlsTarget.z = MathUtils.damp(controlsTarget.z, target.z, followSpeed, delta)
		
		cameraControlsRef.current.update()

		// Ground avoidance logic
		camera.getWorldPosition(cameraPosition.current)
		raycaster.current.set(cameraPosition.current, downDirection.current)

		// Refresh terrain mesh cache periodically instead of every frame
		const frameCount = state.clock.elapsedTime * 60 | 0
		if (frameCount - lastTerrainCacheFrame.current > TERRAIN_CACHE_INTERVAL || terrainMeshesCache.current.length === 0) {
			lastTerrainCacheFrame.current = frameCount
			terrainMeshesCache.current.length = 0
			
			for (let i = 0; i < scene.children.length; i++) {
				const obj = scene.children[i]
				if (obj.name === 'TerrainManager' || obj.name.includes('Terrain')) {
					obj.traverse((child) => {
						if (child.isMesh) {
							terrainMeshesCache.current.push(child)
						}
					})
				}
			}
		}

		// Check for intersections with terrain
		const intersects = raycaster.current.intersectObjects(terrainMeshesCache.current, true)

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
				maxDistance={24}
				minPolarAngle={Math.PI / 6} // Prevent camera from going below the ground
				maxPolarAngle={Math.PI / 2} // Prevent camera from going above the target
				autoRotate={cameraAutoRotate}
				autoRotateSpeed={-0.3}
				enableKeys={false}
			/>
		</>
	)
}

export default CameraControls
