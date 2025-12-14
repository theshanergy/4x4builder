import { useRef, useEffect, useCallback, useMemo } from 'react'
import { Vector3, Raycaster, MathUtils, Quaternion, Matrix4 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useXR } from '@react-three/xr'

import useGameStore, { vehicleState } from '../../../store/gameStore'
import useInputStore from '../../../store/inputStore'
import vehicleConfigs from '../../../vehicleConfigs'

// Camera modes enum
const CameraMode = {
	ORBIT: 'orbit',
	CHASE: 'chase',
	FIRST_PERSON: 'firstPerson',
}

// Array of available camera modes for cycling
const CAMERA_MODES = [CameraMode.ORBIT, CameraMode.CHASE, CameraMode.FIRST_PERSON]

// Shared constants
const TERRAIN_CACHE_INTERVAL = 60
const UP_VECTOR = new Vector3(0, 1, 0)
const DOWN_VECTOR = new Vector3(0, -1, 0)

// Get driver position for a vehicle body, with fallback to default
const getDriverPosition = (bodyId) => {
	const vehicle = vehicleConfigs.vehicles[bodyId]
	if (vehicle?.driverPosition) {
		return new Vector3(...vehicle.driverPosition)
	}
	// Default driver position if not specified in config
	return new Vector3(0.4, 1.55, 0)
}

// Helper to damp all components of a Vector3
const dampVector3 = (current, target, lambda, delta) => {
	current.x = MathUtils.damp(current.x, target.x, lambda, delta)
	current.y = MathUtils.damp(current.y, target.y, lambda, delta)
	current.z = MathUtils.damp(current.z, target.z, lambda, delta)
}

// Custom hook for ground avoidance with terrain caching
const useGroundAvoidance = (positionRef, minGroundDistance, terrainMeshesCache, lastTerrainCacheFrame) => {
	const scene = useThree((state) => state.scene)
	const raycaster = useRef(new Raycaster())

	const checkGroundAvoidance = useCallback(
		(elapsedTime) => {
			// Refresh terrain mesh cache periodically
			const frameCount = (elapsedTime * 60) | 0
			if (frameCount - lastTerrainCacheFrame.current > TERRAIN_CACHE_INTERVAL || terrainMeshesCache.current.length === 0) {
				lastTerrainCacheFrame.current = frameCount
				terrainMeshesCache.current.length = 0

				for (let i = 0; i < scene.children.length; i++) {
					const obj = scene.children[i]
					if (obj.name === 'Terrain' || obj.name.includes('Terrain')) {
						obj.traverse((child) => {
							if (child.isMesh) {
								terrainMeshesCache.current.push(child)
							}
						})
					}
				}
			}

			// Check for intersections with terrain
			raycaster.current.set(positionRef.current, DOWN_VECTOR)
			const intersects = raycaster.current.intersectObjects(terrainMeshesCache.current, true)

			if (intersects.length > 0) {
				const groundDistance = intersects[0].distance
				if (groundDistance < minGroundDistance) {
					positionRef.current.y += minGroundDistance - groundDistance
				}
			}
		},
		[scene, minGroundDistance, terrainMeshesCache, lastTerrainCacheFrame]
	)

	return checkGroundAvoidance
}

// Custom hook to get and cache vehicle group reference with invalidation on vehicle change
const useVehicleGroup = () => {
	const scene = useThree((state) => state.scene)
	const currentVehicle = useGameStore((state) => state.currentVehicle)
	const vehicleGroupRef = useRef(null)
	const lastVehicleBody = useRef(currentVehicle.body)

	// Invalidate cache when vehicle changes
	if (currentVehicle.body !== lastVehicleBody.current) {
		vehicleGroupRef.current = null
		lastVehicleBody.current = currentVehicle.body
	}

	const getVehicleGroup = useCallback(() => {
		if (!vehicleGroupRef.current) {
			vehicleGroupRef.current = scene.getObjectByName('Vehicle')
		}
		return vehicleGroupRef.current
	}, [scene])

	return getVehicleGroup
}

// Orbit/Chase camera controller
const OrbitCamera = ({ followSpeed, minGroundDistance, terrainMeshesCache, lastTerrainCacheFrame, transitionFromInfo }) => {
	const cameraAutoRotate = useGameStore((state) => state.cameraAutoRotate)
	const camera = useThree((state) => state.camera)
	const orbitControlsRef = useRef()

	const cameraPosition = useRef(new Vector3())
	const targetWithOffset = useRef(new Vector3())
	const targetFov = 24 // Default FOV for orbit camera
	const lastFov = useRef(camera.fov)

	// Transition state
	const isTransitioning = useRef(false)
	const transitionStartTime = useRef(0)
	const startPos = useRef(new Vector3())

	useEffect(() => {
		if (transitionFromInfo) {
			isTransitioning.current = true
			transitionStartTime.current = 0
			startPos.current.copy(camera.position)
		}
	}, [transitionFromInfo, camera])

	// Use shared ground avoidance hook
	const checkGroundAvoidance = useGroundAvoidance(cameraPosition, minGroundDistance, terrainMeshesCache, lastTerrainCacheFrame)

	// Initialize controls target to vehicle position to prevent swooping from origin
	useEffect(() => {
		if (orbitControlsRef.current) {
			orbitControlsRef.current.target.copy(vehicleState.position)
			orbitControlsRef.current.target.y += 0.95
		}
	}, [])

	useFrame((state, delta) => {
		if (!orbitControlsRef.current) return

		// Transition logic
		if (isTransitioning.current) {
			if (transitionStartTime.current === 0) {
				transitionStartTime.current = state.clock.elapsedTime
			}

			// 1.5 second transition
			const t = (state.clock.elapsedTime - transitionStartTime.current) / 1.5

			if (t >= 1) {
				isTransitioning.current = false
			} else {
				const isPortrait = window.innerWidth / window.innerHeight < 1
				const defaultOffset = isPortrait ? new Vector3(-2, 1, 12) : new Vector3(-4, 1, 6.5)
				const targetCamPos = new Vector3().copy(vehicleState.position).add(defaultOffset)

				const alpha = 1 - Math.pow(1 - t, 3) // Ease out cubic
				camera.position.lerpVectors(startPos.current, targetCamPos, alpha)
			}
		}

		// Get the target position from vehicleState
		const target = vehicleState.position
		const controlsTarget = orbitControlsRef.current.target

		// Calculate target with Y offset
		targetWithOffset.current.set(target.x, target.y + 0.95, target.z)

		// Use damp for frame-rate independent smoothing
		dampVector3(controlsTarget, targetWithOffset.current, followSpeed, delta)

		// Smoothly transition FOV back to default - only update projection matrix when FOV changes
		const newFov = MathUtils.damp(camera.fov, targetFov, 3, delta)
		if (Math.abs(newFov - lastFov.current) > 0.01) {
			camera.fov = newFov
			camera.updateProjectionMatrix()
			lastFov.current = newFov
		}

		orbitControlsRef.current.update()

		// Ground avoidance logic
		camera.getWorldPosition(cameraPosition.current)
		checkGroundAvoidance(state.clock.elapsedTime)

		// Apply ground avoidance adjustment to camera if needed
		if (cameraPosition.current.y !== camera.position.y) {
			camera.position.y = cameraPosition.current.y
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

	// Calibrated head offset from XR origin (captured when user recenters)
	// This accounts for the user's actual seated head height
	const calibratedHeadOffset = useRef(null)
	const needsCalibration = useRef(true)
	const recenterPressedLastFrame = useRef(false)

	// Transition state - use elapsed time for consistency with rest of codebase
	const isTransitioning = useRef(!isInXR)
	const transitionStartElapsed = useRef(0)
	const startPos = useRef(camera.position.clone())
	const startQuat = useRef(camera.quaternion.clone())
	const startFov = useRef(camera.fov)
	const targetFov = 70 // Target FOV for first-person mode
	const isMounted = useRef(false)
	const transitionStartedThisFrame = useRef(false)

	useEffect(() => {
		if (isMounted.current) {
			if (!isInXR) {
				isTransitioning.current = true
				transitionStartedThisFrame.current = true // Will be set properly in useFrame
				startPos.current.copy(camera.position)
				startQuat.current.copy(camera.quaternion)
				startFov.current = camera.fov
			}
		} else {
			isMounted.current = true
		}
	}, [isInXR, camera])

	// Update driver position when vehicle changes
	useEffect(() => {
		driverPosition.current = getDriverPosition(currentVehicle.body)
	}, [currentVehicle.body])

	// Set near clipping plane for first-person mode (prevents seat/interior from blocking view)
	useEffect(() => {
		if (!isInXR) {
			const originalNear = camera.near
			camera.near = 0.1 // Increased from default to cull nearby geometry like the seat
			return () => {
				camera.near = originalNear
				camera.updateProjectionMatrix()
			}
		}
	}, [camera, isInXR])

	// 180 degree rotation to face forward (for XR origin)
	const seatYawOffset = useMemo(() => new Quaternion().setFromAxisAngle(UP_VECTOR, Math.PI), [])

	// Temp vectors to avoid GC
	const tempPosition = useRef(new Vector3())
	const tempQuat = useRef(new Quaternion())
	const tempOffset = useRef(new Vector3())
	const targetPosition = useRef(new Vector3())
	const targetLookAt = useRef(new Vector3())
	const forwardOffset = useRef(new Vector3())
	const headWorldPos = useRef(new Vector3())
	const originWorldPos = useRef(new Vector3())
	const targetQuat = useRef(new Quaternion())
	const dummyMatrix = useRef(new Matrix4())

	// Use shared vehicle group hook
	const getVehicleGroup = useVehicleGroup()

	useFrame((state) => {
		// Capture transition start time on first frame after transition begins
		if (transitionStartedThisFrame.current) {
			transitionStartElapsed.current = state.clock.elapsedTime
			transitionStartedThisFrame.current = false
		}

		const vehicleGroup = getVehicleGroup()
		if (!vehicleGroup) return

		// Get vehicle world position and rotation
		vehicleGroup.getWorldPosition(tempPosition.current)
		vehicleGroup.getWorldQuaternion(tempQuat.current)

		// Calculate driver head position in world space
		tempOffset.current.copy(driverPosition.current)
		tempOffset.current.applyQuaternion(tempQuat.current)
		targetPosition.current.copy(tempPosition.current).add(tempOffset.current)

		if (isInXR) {
			// In XR mode, position the XR origin so the user's head appears at driver position
			if (xrOriginRef?.current) {
				const { input } = useInputStore.getState()

				// Check for recenter button (X button on controller, or auto-calibrate on first frame)
				const recenterPressed = input.buttonX
				if ((recenterPressed && !recenterPressedLastFrame.current) || needsCalibration.current) {
					// Capture the current head position relative to XR origin (in origin's local space)
					// This represents where the user's head physically is when seated
					camera.getWorldPosition(headWorldPos.current)
					xrOriginRef.current.getWorldPosition(originWorldPos.current)
					calibratedHeadOffset.current = headWorldPos.current.clone().sub(originWorldPos.current)
					needsCalibration.current = false
				}
				recenterPressedLastFrame.current = recenterPressed

				// Position XR origin so that: origin + headOffset = targetPosition (driver head pos)
				// Therefore: origin = targetPosition - headOffset
				if (calibratedHeadOffset.current) {
					// Transform the calibrated offset by vehicle rotation to keep it vehicle-relative
					tempOffset.current.copy(calibratedHeadOffset.current)
					// The offset was captured in world space, so we need to rotate it with the vehicle
					// to maintain the same relative position as the vehicle rotates
					xrOriginRef.current.position.copy(targetPosition.current).sub(tempOffset.current)
				} else {
					// Fallback before calibration (shouldn't happen due to auto-calibrate)
					xrOriginRef.current.position.copy(targetPosition.current)
				}

				// Apply chassis rotation plus 180° yaw to face forward
				xrOriginRef.current.quaternion.copy(tempQuat.current).multiply(seatYawOffset)

				// Force immediate matrix update to prevent XR origin from lagging behind
				xrOriginRef.current.updateMatrixWorld(true)
			}
		} else {
			// Regular first-person camera mode

			// Calculate look-at point (forward from vehicle)
			forwardOffset.current.set(0, 0, 10)
			forwardOffset.current.applyQuaternion(tempQuat.current)
			targetLookAt.current.copy(targetPosition.current).add(forwardOffset.current)
			if (isTransitioning.current) {
				const t = state.clock.elapsedTime - transitionStartElapsed.current // 1 sec transition

				if (t >= 1) {
					isTransitioning.current = false
					camera.position.copy(targetPosition.current)
					camera.lookAt(targetLookAt.current)
					camera.fov = targetFov
					camera.updateProjectionMatrix()
				} else {
					// Calculate target rotation quaternion
					dummyMatrix.current.lookAt(targetPosition.current, targetLookAt.current, UP_VECTOR)
					targetQuat.current.setFromRotationMatrix(dummyMatrix.current)

					// Lerp position, rotation, and FOV
					const alpha = 1 - Math.pow(1 - t, 3) // Ease out cubic
					const fovAlpha = 1 - Math.pow(1 - t * 0.5, 3) // Slower FOV transition
					camera.position.lerpVectors(startPos.current, targetPosition.current, alpha)
					camera.quaternion.slerpQuaternions(startQuat.current, targetQuat.current, alpha)
					camera.fov = MathUtils.lerp(startFov.current, targetFov, fovAlpha)
					camera.updateProjectionMatrix()
				}
			} else {
				// Set camera position and FOV - only update projection matrix if FOV changed
				camera.position.copy(targetPosition.current)
				camera.lookAt(targetLookAt.current)
				if (camera.fov !== targetFov) {
					camera.fov = targetFov
					camera.updateProjectionMatrix()
				}
			}
		}
	})

	return null
}

// Chase camera controller
const ChaseCamera = ({ terrainMeshesCache, lastTerrainCacheFrame }) => {
	const camera = useThree((state) => state.camera)

	const currentPosition = useRef(camera.position.clone())
	const currentLookAt = useRef(new Vector3(0, 0, -10).applyQuaternion(camera.quaternion).add(camera.position))

	const minGroundDistance = 0.5
	const targetFov = 24 // Default FOV for chase camera
	const lastFov = useRef(camera.fov)

	// Temp vectors
	const tempVec = useRef(new Vector3())
	const tempQuat = useRef(new Quaternion())
	const idealOffset = useRef(new Vector3())
	const idealLookAt = useRef(new Vector3())

	// Use shared hooks
	const getVehicleGroup = useVehicleGroup()
	const checkGroundAvoidance = useGroundAvoidance(currentPosition, minGroundDistance, terrainMeshesCache, lastTerrainCacheFrame)

	useFrame((state, delta) => {
		const vehicleGroup = getVehicleGroup()
		if (!vehicleGroup) return

		// Get vehicle world position and rotation
		vehicleGroup.getWorldPosition(tempVec.current)
		vehicleGroup.getWorldQuaternion(tempQuat.current)

		// Calculate ideal camera position (behind and up)
		idealOffset.current.set(0, 3.5, -8)
		idealOffset.current.applyQuaternion(tempQuat.current)
		idealOffset.current.add(tempVec.current)

		// Calculate ideal look target (slightly ahead of vehicle)
		idealLookAt.current.set(0, 1.5, 5)
		idealLookAt.current.applyQuaternion(tempQuat.current)
		idealLookAt.current.add(tempVec.current)

		// Smoothly interpolate camera position and look-at
		// Lower lambda = more lag/smoothing
		const posLambda = 4
		const lookLambda = 6

		dampVector3(currentPosition.current, idealOffset.current, posLambda, delta)
		dampVector3(currentLookAt.current, idealLookAt.current, lookLambda, delta)

		// Smoothly transition FOV back to default - only update projection matrix when FOV changes
		const newFov = MathUtils.damp(camera.fov, targetFov, 3, delta)
		if (Math.abs(newFov - lastFov.current) > 0.01) {
			camera.fov = newFov
			camera.updateProjectionMatrix()
			lastFov.current = newFov
		}

		// Ground avoidance logic using shared hook
		checkGroundAvoidance(state.clock.elapsedTime)

		camera.position.copy(currentPosition.current)
		camera.lookAt(currentLookAt.current)
	})

	return null
}

// Info camera controller - triggered by info mode
const InfoCamera = () => {
	const camera = useThree((state) => state.camera)

	const currentPosition = useRef(camera.position.clone())
	const currentLookAt = useRef(new Vector3(0, 0, 0).applyQuaternion(camera.quaternion).add(camera.position))

	const targetFov = 30
	const lastFov = useRef(camera.fov)

	// Temp vectors
	const tempVec = useRef(new Vector3())
	const tempQuat = useRef(new Quaternion())
	const idealOffset = useRef(new Vector3())
	const idealLookAt = useRef(new Vector3())

	// Use shared hooks
	const getVehicleGroup = useVehicleGroup()

	useFrame((state, delta) => {
		const vehicleGroup = getVehicleGroup()
		if (!vehicleGroup) return

		// Get vehicle world position and rotation
		vehicleGroup.getWorldPosition(tempVec.current)
		vehicleGroup.getWorldQuaternion(tempQuat.current)

		// Calculate ideal camera position (Front Right)
		// Position: Right (3.5), Up (2), Forward (8.5)
		idealOffset.current.set(3.5, 2, 8.5)
		idealOffset.current.applyQuaternion(tempQuat.current)
		idealOffset.current.add(tempVec.current)

		// Calculate ideal look target (Left Front)
		// Target: Left (1), Up (0), Forward (1.5)
		idealLookAt.current.set(-1, 0, 1.5)
		idealLookAt.current.applyQuaternion(tempQuat.current)
		idealLookAt.current.add(tempVec.current)

		// Smoothly interpolate camera position and look-at
		const posLambda = 3
		const lookLambda = 4

		dampVector3(currentPosition.current, idealOffset.current, posLambda, delta)
		dampVector3(currentLookAt.current, idealLookAt.current, lookLambda, delta)

		// Smoothly transition FOV
		const newFov = MathUtils.damp(camera.fov, targetFov, 3, delta)
		if (Math.abs(newFov - lastFov.current) > 0.01) {
			camera.fov = newFov
			camera.updateProjectionMatrix()
			lastFov.current = newFov
		}

		camera.position.copy(currentPosition.current)
		camera.lookAt(currentLookAt.current)
	})

	return null
}

// Main camera manager - handles switching between camera modes
const CameraManager = ({ followSpeed = 8, minGroundDistance = 0.5 }) => {
	const cameraMode = useGameStore((state) => state.cameraMode)
	const setCameraMode = useGameStore((state) => state.setCameraMode)
	const infoMode = useGameStore((state) => state.infoMode)
	const prevInfoMode = useRef(infoMode)

	useEffect(() => {
		prevInfoMode.current = infoMode
	}, [infoMode])

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

	// Handle info mode
	if (infoMode) {
		return <InfoCamera />
	}

	// Render the appropriate camera controller based on current mode
	switch (cameraMode) {
		case CameraMode.FIRST_PERSON:
			return <FirstPersonCamera isInXR={isInXR} />
		case CameraMode.CHASE:
			return <ChaseCamera terrainMeshesCache={terrainMeshesCache} lastTerrainCacheFrame={lastTerrainCacheFrame} />
		case CameraMode.ORBIT:
		default:
			return (
				<OrbitCamera
					followSpeed={followSpeed}
					minGroundDistance={minGroundDistance}
					terrainMeshesCache={terrainMeshesCache}
					lastTerrainCacheFrame={lastTerrainCacheFrame}
					transitionFromInfo={prevInfoMode.current}
				/>
			)
	}
}

export default CameraManager
