import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshStandardMaterial } from 'three'

// Visual drone model with arms and spinning propellers
const Drone = ({ velocity = 0, tilt = { pitch: 0, roll: 0 } }) => {
	const propRefs = useRef([])

	// Animate propellers based on velocity
	useFrame((state, delta) => {
		// Base spin speed, increases with velocity
		const baseSpeed = 20
		const velocityBoost = Math.abs(velocity) * 2
		const spinSpeed = baseSpeed + velocityBoost

		propRefs.current.forEach((prop, i) => {
			if (prop) {
				// Alternate spin direction for standard quadcopter physics
				// 0: CW, 1: CCW, 2: CW, 3: CCW
				const dir = i % 2 === 0 ? 1 : -1
				prop.rotation.y += spinSpeed * delta * dir
			}
		})
	})

	// Drone dimensions
	const bodySize = [0.1, 0.04, 0.15]
	const armLength = 0.25
	const armWidth = 0.03
	const armThickness = 0.015
	const propRadius = 0.12
	const propThickness = 0.002
	const motorHeight = 0.03
	const motorRadius = 0.02

	// Material
	const material = useMemo(() => new MeshStandardMaterial({ color: '#2a2a2a' }), [])

	return (
		<group rotation={[tilt.pitch || 0, 0, tilt.roll || 0]}>
			{/* Main Body */}
			<mesh position={[0, 0, 0]}>
				<boxGeometry args={bodySize} />
				<primitive object={material} />
			</mesh>

			{/* Arms (X configuration) */}
			<group>
				{/* Arm 1 (Front-Right to Back-Left) */}
				<mesh rotation={[0, -Math.PI / 4, 0]}>
					<boxGeometry args={[armLength * 2.5, armThickness, armWidth]} />
					<primitive object={material} />
				</mesh>

				{/* Arm 2 (Front-Left to Back-Right) */}
				<mesh rotation={[0, Math.PI / 4, 0]}>
					<boxGeometry args={[armLength * 2.5, armThickness, armWidth]} />
					<primitive object={material} />
				</mesh>
			</group>

			{/* Motors and Props */}
			{[
				{ x: -1, z: -1 }, // Front Left
				{ x: 1, z: -1 }, // Front Right
				{ x: 1, z: 1 }, // Back Right
				{ x: -1, z: 1 }, // Back Left
			].map((pos, index) => {
				const reach = armLength * 0.9
				const x = pos.x * reach
				const z = pos.z * reach

				return (
					<group key={index} position={[x, armThickness / 2, z]}>
						{/* Motor */}
						<mesh position={[0, -motorHeight / 2, 0]}>
							<cylinderGeometry args={[motorRadius, motorRadius, motorHeight, 16]} />
							<primitive object={material} />
						</mesh>

						{/* Propeller */}
						<mesh ref={(el) => (propRefs.current[index] = el)} position={[0, motorHeight, 0]}>
							<boxGeometry args={[propRadius * 2.2, propThickness, propRadius * 0.2]} />
							<primitive object={material} />
						</mesh>
					</group>
				)
			})}
		</group>
	)
}

export default Drone
