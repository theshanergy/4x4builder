import useGameStore from '../store/gameStore'
import useVehicleFromUrl from '../hooks/useVehicleFromUrl'

import Header from './ui/Header'
import Sidebar from './ui/Sidebar'
import Canvas from './scene/Canvas'
import Actions from './ui/Actions'
import Speedometer from './ui/Speedometer'
import Notification from './ui/Notification'
import ControlsOverlay from './ui/ControlsOverlay'
import Chat from './ui/Chat'
import VehicleInfo from './ui/VehicleInfo'

export default function App() {
	const infoMode = useGameStore((state) => state.infoMode)

	// Load vehicle from URL if present
	useVehicleFromUrl()

	return (
		<div className='App'>
			<Canvas />

			{/* UI Components */}
			{infoMode ? null : (
				<>
					<Header />
					<Sidebar />
					<Speedometer />
					<Actions />
					<ControlsOverlay />
					<Chat />
				</>
			)}

			{/* Vehicle Info overlay */}
			<VehicleInfo />

			<Notification />
		</div>
	)
}
