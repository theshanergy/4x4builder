import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { PerformanceMonitor } from '@react-three/drei'
import { createXRStore, XR, XROrigin } from '@react-three/xr'

import useGameStore from '../../store/gameStore'
import Environment from './Environment'
import CameraControls from './CameraControls'
import InputManager from './InputManager'
import Loader from '../ui/Loader'
import VehicleManager from './VehicleManager'
import Screenshot from '../ui/Screenshot'

// Create XR store instance
export const xrStore = createXRStore({
	hand: { teleportPointer: true },
	controller: { teleportPointer: true },
})

// Canvas component
const ThreeCanvas = () => {
	const physicsEnabled = useGameStore((state) => state.physicsEnabled)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const setPerformanceDegraded = useGameStore((state) => state.setPerformanceDegraded)

	// Set default camera position based on aspect ratio
	const cameraConfig = useMemo(() => {
		const isPortrait = window.innerWidth / window.innerHeight < 1
		const defaultCameraPosition = isPortrait ? [-2, 1, 12] : [-4, 1, 6.5]
		return { position: defaultCameraPosition, fov: 24 }
	}, [])

	return (
		<div id='canvas' className='absolute inset-0 overflow-hidden'>
			<Loader />

			<Canvas shadows={!performanceDegraded} dpr={performanceDegraded ? 1 : [1, 1.5]} camera={cameraConfig}>
				<PerformanceMonitor onDecline={() => setPerformanceDegraded(true)} />
				<XR store={xrStore}>
					<InputManager />

					<CameraControls />

					<XROrigin position={[0, 0, 5]} scale={1} />

					<Physics paused={!physicsEnabled}>
						<Suspense fallback={null}>
							<VehicleManager />
						</Suspense>

						<Environment />
					</Physics>

					<Screenshot />
				</XR>
			</Canvas>
		</div>
	)
}

export default ThreeCanvas
