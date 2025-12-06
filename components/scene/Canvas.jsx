import { Suspense, useMemo, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { PerformanceMonitor } from '@react-three/drei'

import useGameStore from '../../store/gameStore'
import Environment from './Environment'
import CameraControls from './CameraControls'
import InputManager from './InputManager'
import XRManager from './XRManager'
import Loader from '../ui/Loader'
import VehicleManager from './VehicleManager'
import RemoteVehicleManager from './RemoteVehicleManager'
import Screenshot from '../ui/Screenshot'
import useConfigSync from '../../hooks/useConfigSync'

// Dev-only performance monitor - completely excluded from production bundle
const PerfMonitor = import.meta.env.DEV
	? (await import('./PerformanceMonitor')).default
	: () => null

// Canvas component
const ThreeCanvas = () => {
	const physicsEnabled = useGameStore((state) => state.physicsEnabled)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const setPerformanceDegraded = useGameStore((state) => state.setPerformanceDegraded)

	// Sync vehicle config changes to multiplayer server
	useConfigSync()

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
				<PerfMonitor />
				<XRManager>
					<InputManager />

					<CameraControls />

					<Physics paused={!physicsEnabled}>
						<Suspense fallback={null}>
							<VehicleManager />
						</Suspense>

						{/* Remote players' vehicles */}
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
