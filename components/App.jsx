import { useParams } from 'react-router-dom'
import useGameStore from '../store/gameStore'
import useVehicleFromUrl from '../hooks/useVehicleFromUrl'
import vehicleConfigs from '../vehicleConfigs'

import Header from './ui/Header'
import Sidebar from './ui/Sidebar'
import Canvas from './scene/Canvas'
import Actions from './ui/Actions'
import Speedometer from './ui/Speedometer'
import Notification from './ui/Notification'
import ControlsOverlay from './ui/ControlsOverlay'
import Chat from './ui/Chat'
import VehicleHero from './ui/VehicleHero'
import VehicleInfo from './ui/VehicleInfo'
import SEO from './ui/SEO'

export default function App() {
	const params = useParams()
	const infoMode = useGameStore((state) => state.infoMode)
	const currentVehicle = useGameStore((state) => state.currentVehicle)

	// Load vehicle from URL if present
	useVehicleFromUrl()

	return (
		<div className='App'>
			<SEO />
			{/* Canvas wrapper */}
			<div className={`${infoMode ? 'relative min-h-[60vh]' : 'absolute inset-0 overflow-hidden'}`}>
				<Canvas />
				{infoMode && <VehicleHero vehicleId={currentVehicle.body} />}
			</div>
			{/* UI Components */}
			{infoMode ? (
				<VehicleInfo vehicleId={currentVehicle.body} />
			) : (
				<>
					<Header />
					<Sidebar />
					<Speedometer />
					<Actions />
					<ControlsOverlay />
					<Chat />
				</>
			)}
			<Notification />
		</div>
	)
}
