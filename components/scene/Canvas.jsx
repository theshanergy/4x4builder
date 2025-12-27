import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { PerformanceMonitor } from '@react-three/drei'

import useGameStore from '../../store/gameStore'
import Environment from './environment/Environment'
import CameraManager from './managers/CameraManager'
import InputManager from './managers/InputManager'
import XRManager from './managers/XRManager'
import Loader from '../ui/Loader'
import Vehicle from './vehicles/Vehicle'
import RemoteVehicleManager from './vehicles/RemoteVehicleManager'
import Screenshot from '../ui/Screenshot'
import useVehicleSync from '../../hooks/useVehicleSync'

// Dev-only performance monitor - completely excluded from production bundle
const PerfMonitor = import.meta.env.DEV ? (await import('./managers/PerformanceMonitor')).default : () => null

// Canvas component
const ThreeCanvas = () => {
	const physicsEnabled = useGameStore((state) => state.physicsEnabled)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const setPerformanceDegraded = useGameStore((state) => state.setPerformanceDegraded)

	// Sync vehicle config changes to multiplayer server
	useVehicleSync()

	// Set default camera position based on aspect ratio
	const cameraConfig = useMemo(() => {
		const isPortrait = window.innerWidth / window.innerHeight < 1
		const defaultCameraPosition = isPortrait ? [-2, 1, 12] : [-4, 1, 6.5]
		return { position: defaultCameraPosition, fov: 24 }
	}, [])

	return (
		<div id='canvas' className='absolute inset-0 overflow-hidden'>
			<Loader />

			<Canvas shadows={{ enabled: !performanceDegraded }} dpr={performanceDegraded ? 1 : [1, 1.5]} camera={cameraConfig}>
				<PerformanceMonitor onDecline={() => setPerformanceDegraded(true)} />
				<PerfMonitor />
				<XRManager>
					<InputManager />

					<CameraManager />

					<Physics paused={!physicsEnabled}>
						<Suspense fallback={null}>
							<Vehicle />
						</Suspense>

						<RemoteVehicleManager />

						<Environment />
					</Physics>

					<Screenshot />
				</XRManager>
			</Canvas>
		</div>
	)
}

export default ThreeCanvas
