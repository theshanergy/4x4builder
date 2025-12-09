import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useXR } from '@react-three/xr'
import { Vector3, Raycaster, MathUtils, Quaternion } from 'three'

import useGameStore, { vehicleState } from '../../store/gameStore'
import useInputStore from '../../store/inputStore'
import vehicleConfigs from '../../vehicleConfigs'

// Camera modes enum
export const CameraMode = {
	ORBIT: 'orbit',
	FIRST_PERSON: 'firstPerson',
	// Future camera modes can be added here:
	// HOOD: 'hood',
	// BUMPER: 'bumper',
	// CINEMATIC: 'cinematic',
}

// Array of available camera modes for cycling
const CAMERA_MODES = [CameraMode.ORBIT, CameraMode.FIRST_PERSON]

// Get driver position for a vehicle body, with fallback to default
export const getDriverPosition = (bodyId) => {
	const vehicle = vehicleConfigs.vehicles[bodyId]
	if (vehicle?.driverPosition) {
		return new Vector3(...vehicle.driverPosition)
	}
	// Default driver position if not specified in config
	return new Vector3(0.35, 1.1, 0.2)
}

// Orbit/Chase camera controller
const OrbitCamera = ({ followSpeed, minGroundDistance, terrainMeshesCache, lastTerrainCacheFrame }) => {
	const cameraAutoRotate = useGameStore((state) => state.cameraAutoRotate)
	const camera = useThree((state) => state.camera)
	const scene = useThree((state) => state.scene)
	const orbitControlsRef = useRef()

	const raycaster = useRef(new Raycaster())
	const downDirection = useRef(new Vector3(0, -1, 0))
	const cameraPosition = useRef(new Vector3())
	const TERRAIN_CACHE_INTERVAL = 60

	useFrame((state, delta) => {
		if (!orbitControlsRef.current) return

		// Get the target position from vehicleState
		const target = vehicleState.position
		const controlsTarget = orbitControlsRef.current.target

		// Use damp for frame-rate independent smoothing
		controlsTarget.x = MathUtils.damp(controlsTarget.x, target.x, followSpeed, delta)
		controlsTarget.y = MathUtils.damp(controlsTarget.y, target.y + 0.95, followSpeed, delta)
		controlsTarget.z = MathUtils.damp(controlsTarget.z, target.z, followSpeed, delta)

		orbitControlsRef.current.update()

		// Ground avoidance logic
		camera.getWorldPosition(cameraPosition.current)
		raycaster.current.set(cameraPosition.current, downDirection.current)

		// Refresh terrain mesh cache periodically
		const frameCount = (state.clock.elapsedTime * 60) | 0
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
			const groundDistance = intersects[0].distance
			if (groundDistance < minGroundDistance) {
				camera.position.y += minGroundDistance - groundDistance
			}
		}
	})

	return (
		<OrbitControls
			ref={orbitControlsRef}
			enableDamping
			dampingFactor={0.025}
			minDistance={2}
			maxDistance={24}
			minPolarAngle={Math.PI / 6}
			maxPolarAngle={Math.PI / 2}
			autoRotate={cameraAutoRotate}
			autoRotateSpeed={-0.3}
			enableKeys={false}
		/>
	)
}

// First-person camera controller (also handles XR origin when in VR)
const FirstPersonCamera = ({ isInXR = false }) => {
	const camera = useThree((state) => state.camera)
	const currentVehicle = useGameStore((state) => state.currentVehicle)
	const xrOriginRef = useGameStore((state) => state.xrOriginRef)

	// Get driver position from vehicle config
	const driverPosition = useRef(getDriverPosition(currentVehicle.body))

	// Update driver position when vehicle changes
	useEffect(() => {
		driverPosition.current = getDriverPosition(currentVehicle.body)
	}, [currentVehicle.body])

	// Set near clipping plane for first-person mode (prevents seat/interior from blocking view)
	useEffect(() => {
		if (!isInXR) {
			const originalNear = camera.near
			const originalFov = camera.fov
			camera.near = 0.1 // Increased from default to cull nearby geometry like the seat
			camera.fov = 70 // Slightly narrower FOV feels more natural for driving
			camera.updateProjectionMatrix()
			return () => {
				camera.near = originalNear
				camera.fov = originalFov
				camera.updateProjectionMatrix()
			}
		}
	}, [camera, isInXR])

	// 180 degree rotation to face forward (for XR origin)
	const seatYawOffset = useMemo(() => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI), [])

	// Temp vectors to avoid GC
	const tempPosition = useRef(new Vector3())
	const tempQuat = useRef(new Quaternion())
	const tempOffset = useRef(new Vector3())
	const targetPosition = useRef(new Vector3())
	const targetLookAt = useRef(new Vector3())
	const forwardOffset = useRef(new Vector3())
	
	// Cache vehicle group reference to avoid scene traversal every frame
	const vehicleGroupRef = useRef(null)

	useFrame((state) => {
		// Get vehicle chassis group from scene (cache reference)
		if (!vehicleGroupRef.current) {
			vehicleGroupRef.current = state.scene.getObjectByName('Vehicle')
		}
		const vehicleGroup = vehicleGroupRef.current
		if (!vehicleGroup) return

		// Get vehicle world position and rotation
		vehicleGroup.getWorldPosition(tempPosition.current)
		vehicleGroup.getWorldQuaternion(tempQuat.current)

		// Calculate driver head position in world space
		tempOffset.current.copy(driverPosition.current)
		tempOffset.current.applyQuaternion(tempQuat.current)
		targetPosition.current.copy(tempPosition.current).add(tempOffset.current)

		if (isInXR) {
			// In XR mode, position the XR origin at the driver seat
			if (xrOriginRef?.current) {
				xrOriginRef.current.position.copy(targetPosition.current)
				// Apply chassis rotation plus 180° yaw to face forward
				xrOriginRef.current.quaternion.copy(tempQuat.current).multiply(seatYawOffset)
			}
		} else {
			// Regular first-person camera mode
			// Set camera position
			camera.position.copy(targetPosition.current)

			// Calculate look-at point (forward from vehicle)
			forwardOffset.current.set(0, 0, 10)
			forwardOffset.current.applyQuaternion(tempQuat.current)
			targetLookAt.current.copy(targetPosition.current).add(forwardOffset.current)

			camera.lookAt(targetLookAt.current)
		}
	})

	return null
}

// Main camera manager - handles switching between camera modes
const CameraManager = ({ followSpeed = 8, minGroundDistance = 0.5 }) => {
	const cameraMode = useGameStore((state) => state.cameraMode)
	const setCameraMode = useGameStore((state) => state.setCameraMode)

	// Check if in XR session
	const isInXR = useXR((state) => state.mode !== null)

	// Track key state to detect press (not hold)
	const keyPressedLastFrame = useRef(false)

	// Shared terrain cache for cameras that need ground avoidance
	const terrainMeshesCache = useRef([])
	const lastTerrainCacheFrame = useRef(0)

	// Handle camera mode cycling with C key
	const cycleCameraMode = useCallback(() => {
		const currentIndex = CAMERA_MODES.indexOf(cameraMode)
		const nextIndex = (currentIndex + 1) % CAMERA_MODES.length
		setCameraMode(CAMERA_MODES[nextIndex])
	}, [cameraMode, setCameraMode])

	// Check for camera switch input each frame
	useFrame(() => {
		const { keys, input } = useInputStore.getState()
		// C key or Y button to cycle cameras (works in both regular and XR mode)
		const switchPressed = keys.has('c') || input.buttonY

		if (switchPressed && !keyPressedLastFrame.current) {
			cycleCameraMode()
		}
		keyPressedLastFrame.current = switchPressed
	})

	// Render the appropriate camera controller based on current mode
	switch (cameraMode) {
		case CameraMode.FIRST_PERSON:
			return <FirstPersonCamera isInXR={isInXR} />
		case CameraMode.ORBIT:
		default:
			return (
				<OrbitCamera
					followSpeed={followSpeed}
					minGroundDistance={minGroundDistance}
					terrainMeshesCache={terrainMeshesCache}
					lastTerrainCacheFrame={lastTerrainCacheFrame}
				/>
			)
	}
}

export default CameraManager
