import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { PerformanceMonitor } from '@react-three/drei'

import useGameStore from '../../store/gameStore'
import Environment from './environment/Environment'
import CameraManager from './cameras/CameraManager'
import InputManager from './managers/InputManager'
import XR from './xr'
import Loader from '../ui/Loader'
import Vehicle from './vehicles/Vehicle'
import RemoteVehicleManager from './vehicles/RemoteVehicleManager'
import Screenshot from '../ui/Screenshot'

// Dev-only performance monitor - completely excluded from production bundle
const PerfMonitor = import.meta.env.DEV ? (await import('./managers/PerformanceMonitor')).default : () => null

// Canvas component
const ThreeCanvas = () => {
	const physicsEnabled = useGameStore((state) => state.physicsEnabled)
	const performanceDegraded = useGameStore((state) => state.performanceDegraded)
	const setPerformanceDegraded = useGameStore((state) => state.setPerformanceDegraded)

	return (
		<div id='canvas' className='absolute inset-0 overflow-hidden'>
			<Loader />

			<Canvas shadows={{ enabled: !performanceDegraded }} dpr={performanceDegraded ? 1 : [1, 1.5]} gl={{ logarithmicDepthBuffer: true }}>
				<PerformanceMonitor onDecline={() => setPerformanceDegraded(true)} />
				<PerfMonitor />
				<XR>
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
				</XR>
			</Canvas>
		</div>
	)
}

export default ThreeCanvas
