import { useRef, useEffect, useState } from 'react'
import { useRapier, useAfterPhysicsStep } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import { Vector3, Quaternion } from 'three'

import useGameStore from '../store/gameStore'
import useInputStore from '../store/inputStore'

// Constants
const VECTORS = {
    UP: new Vector3(0, 1, 0),
    RIGHT: new Vector3(1, 0, 0),
    DOWN: new Vector3(0, -1, 0),
    FORWARD: new Vector3(0, 0, 1),
}

// Physics
const FORCES = {
    accelerate: 30,
    brake: 0.5,
    steerAngle: Math.PI / 6,
    airControl: 0.1, // Subtle air control force
}

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

    // Track airborne state
    const [isAirborne, setIsAirborne] = useState(false)

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

        // Check if all wheels are not in contact with the ground (airborne)
        let wheelsInContact = 0

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

            // Check if the wheel is in contact with the ground
            if (controller.wheelIsInContact(index)) {
                wheelsInContact++
            }

            // Update position
            wheelRef.position.y = connection?.y - suspension

            // Apply steering and rotation
            wheelRef.quaternion.multiplyQuaternions(new Quaternion().setFromAxisAngle(VECTORS.UP, steering), new Quaternion().setFromAxisAngle(wheelAxleCs, rotation))
        })

        // Update airborne state
        const newAirborneState = wheelsInContact === 0
        if (newAirborneState !== isAirborne) {
            setIsAirborne(newAirborneState)
        }
    })

    // Handle input forces each frame
    useFrame(() => {
        if (!vehicleController.current) return

        // Get input refs from store
        const { keys, gamepadAxes, gamepadButtons } = useInputStore.getState()

        // Get gamepad input
        const leftStickX = gamepadAxes[0] || 0
        const leftStickY = gamepadAxes[1] || 0
        const rightStickX = gamepadAxes[2] || 0
        const rightStickY = gamepadAxes[3] || 0

        const leftTrigger = gamepadButtons[6] ? 1 : 0
        const rightTrigger = gamepadButtons[7] ? 1 : 0

        const clamp = (value) => Math.min(1, Math.max(-1, value))

        // Calculate forces based on input
        const engineForce = FORCES.accelerate * clamp((keys.has('ArrowUp') ? 1 : 0) + (rightStickY < 0 ? -rightStickY : 0) + rightTrigger)
        const steerForce = FORCES.steerAngle * clamp((keys.has('ArrowRight') ? -1 : 0) + (keys.has('ArrowLeft') ? 1 : 0) + -leftStickX)
        const brakeForce = FORCES.brake * clamp((keys.has('ArrowDown') ? 1 : 0) + (rightStickY > 0 ? rightStickY : 0) + leftTrigger)

        if (!isAirborne) {
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
        } else {
            // Airborne controls when all wheels are not in contact
            const vehicle = vehicleRef.current
            if (vehicle) {
                const pitch = clamp((keys.has('ArrowUp') ? -1 : 0) + (keys.has('ArrowDown') ? 1 : 0) - leftStickY)
                const roll = clamp((keys.has('ArrowLeft') ? -1 : 0) + (keys.has('ArrowRight') ? 1 : 0) + leftStickX)
                const yaw = clamp(-rightStickX)

                // Construct torque vector in world space
                const localTorque = new Vector3(pitch, yaw, roll)
                const worldTorque = localTorque.applyQuaternion(new Quaternion().copy(vehicle.rotation()))

                // Apply impulse
                vehicle.applyTorqueImpulse(worldTorque.multiplyScalar(FORCES.airControl), true)
            }
        }

        // Enable physics if not already enabled
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
