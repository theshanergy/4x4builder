import { useRef, useEffect } from 'react'
import { useRapier, useAfterPhysicsStep } from '@react-three/rapier'
import * as THREE from 'three'

// Constants
const VECTORS = {
    UP: new THREE.Vector3(0, 1, 0),
    RIGHT: new THREE.Vector3(1, 0, 0),
    DOWN: new THREE.Vector3(0, -1, 0),
}

/**
 * Generic vehicle physics hook for wheeled vehicles
 * @param {Object} vehicleRef - Reference to the vehicle rigid body
 * @param {Array} wheels - Array of wheel configurations with refs and positions
 * @param {Object} config - Vehicle configuration
 * @returns {Object} - Vehicle controller and other physics-related functions
 */
export const useVehiclePhysics = (vehicleRef, wheels, config = {}) => {
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

    // Basic vehicle control functions
    const applyEngineForce = (wheelIndex, force) => {
        if (!vehicleController.current) return
        vehicleController.current.setWheelEngineForce(wheelIndex, force)
    }

    const applySteering = (wheelIndex, angle) => {
        if (!vehicleController.current) return
        vehicleController.current.setWheelSteering(wheelIndex, angle)
    }

    const applyBrake = (wheelIndex, force) => {
        if (!vehicleController.current) return
        vehicleController.current.setWheelBrake(wheelIndex, force)
    }

    // Calculate vehicle velocity
    const getVelocity = () => {
        if (!vehicleRef.current) return new THREE.Vector3()
        const vel = vehicleRef.current.linvel()
        return new THREE.Vector3(vel.x, vel.y, vel.z)
    }

    // Return the vehicleController ref and control functions
    return {
        vehicleController,
        applyEngineForce,
        applySteering,
        applyBrake,
        getVelocity,
    }
}

export default useVehiclePhysics
