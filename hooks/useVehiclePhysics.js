import { useRef, useEffect } from 'react'
import { useRapier, useAfterPhysicsStep } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import useGameStore from '../store/gameStore'

// Constants
const VECTORS = {
    UP: new THREE.Vector3(0, 1, 0),
    RIGHT: new THREE.Vector3(1, 0, 0),
    DOWN: new THREE.Vector3(0, -1, 0),
}

// Physics
const FORCES = { accelerate: 30, brake: 0.5, steerAngle: Math.PI / 6 }

/**
 * Generic vehicle physics hook for wheeled vehicles
 * @param {Object} vehicleRef - Reference to the vehicle rigid body
 * @param {Array} wheels - Array of wheel configurations with refs and positions
 * @returns {Object} - Vehicle controller
 */
export const useVehiclePhysics = (vehicleRef, wheels) => {
    const physicsEnabled = useGameStore((state) => state.physicsEnabled)
    const setPhysicsEnabled = useGameStore((state) => state.setPhysicsEnabled)

    const { world } = useRapier()

    // Refs
    const vehicleController = useRef()

    // Setup vehicle physics
    useEffect(() => {
        if (!vehicleRef.current) return

        // Create vehicle controller
        const vehicle = world.createVehicleController(vehicleRef.current)

        // Set the vehicle's forward axis to Z (index 2)
        // This makes the forward direction perpendicular to the wheel axle direction
        vehicle.setIndexForwardAxis = 2

        // Add and configure wheels
        wheels.forEach((wheel, index) => {
            vehicle.addWheel(wheel.position, wheel.suspensionDirection || VECTORS.DOWN, wheel.axleCs || VECTORS.RIGHT, wheel.suspensionRestLength || 0.05, wheel.radius)
            vehicle.setWheelSuspensionStiffness(index, wheel.suspensionStiffness || 20)
            vehicle.setWheelMaxSuspensionTravel(index, wheel.maxSuspensionTravel || 0.23)
            vehicle.setWheelSuspensionCompression(index, wheel.suspensionCompression || 2.3)
            vehicle.setWheelSuspensionRelaxation(index, wheel.suspensionRebound || 3.4)
        })

        // Store controller reference
        vehicleController.current = vehicle

        return () => {
            if (vehicleController.current) {
                world.removeVehicleController(vehicle)
                vehicleController.current = null
            }
        }
    }, [vehicleRef, wheels, world])

    // Update wheel positions after physics step
    useAfterPhysicsStep((world) => {
        const controller = vehicleController.current
        if (!controller) return

        // Update the vehicle with safe timestep
        controller.updateVehicle(world.timestep)

        // Update each wheel
        wheels.forEach((wheel, index) => {
            const wheelRef = wheel.ref.current
            if (!wheelRef) return

            // Get wheel data with fallbacks
            const wheelAxleCs = controller.wheelAxleCs(index) || VECTORS.RIGHT
            const connection = controller.wheelChassisConnectionPointCs(index)
            const suspension = controller.wheelSuspensionLength(index) || 0
            const steering = controller.wheelSteering(index) || 0
            const rotation = controller.wheelRotation(index) || 0

            // Update position
            wheelRef.position.y = connection?.y - suspension

            // Apply steering and rotation
            wheelRef.quaternion.multiplyQuaternions(new THREE.Quaternion().setFromAxisAngle(VECTORS.UP, steering), new THREE.Quaternion().setFromAxisAngle(wheelAxleCs, rotation))
        })
    })

    // Handle input forces each frame
    useFrame(() => {
        if (!vehicleController.current) return

        // Get input refs from store
        const inputRefs = useGameStore.getState().inputRefs
        if (!inputRefs) return

        const { leftStick, rightStick, leftTrigger, rightTrigger, keys } = inputRefs
        const clamp = (value) => Math.min(1, Math.max(-1, value))

        const engineForce = FORCES.accelerate * clamp((keys.current?.['ArrowUp'] ? 1 : 0) + (rightStick.current?.y < 0 ? -rightStick.current.y : 0) + (rightTrigger.current || 0))
        const steerForce = FORCES.steerAngle * clamp((keys.current?.['ArrowRight'] ? -1 : 0) + (keys.current?.['ArrowLeft'] ? 1 : 0) + (-leftStick.current?.x || 0))
        const brakeForce = FORCES.brake * clamp((keys.current?.['ArrowDown'] ? 1 : 0) + (rightStick.current?.y > 0 ? rightStick.current.y : 0) + (leftTrigger.current || 0))

        // Front wheels steering (assuming first two wheels are front)
        for (let i = 0; i < 2 && i < wheels.length; i++) {
            vehicleController.current.setWheelSteering(i, steerForce)
        }

        // Rear wheels driving (assuming last two wheels are rear)
        for (let i = 2; i < 4 && i < wheels.length; i++) {
            vehicleController.current.setWheelEngineForce(i, -engineForce)
        }

        // All wheels braking
        for (let i = 0; i < wheels.length; i++) {
            vehicleController.current.setWheelBrake(i, brakeForce)
        }

        // Up Arrow
        if (!physicsEnabled && engineForce) {
            setPhysicsEnabled(true)
        }
    })

    // Return the vehicleController ref and control functions
    return {
        vehicleController,
    }
}

export default useVehiclePhysics
