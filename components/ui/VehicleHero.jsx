import vehicleConfigs from '../../vehicleConfigs'
import useGameStore from '../../store/gameStore'
import Logo from './Logo'

function VehicleHero({ vehicleId }) {
	const vehicleData = vehicleConfigs.vehicles[vehicleId]
	const setInfoMode = useGameStore((state) => state.setInfoMode)

	if (!vehicleData) {
		return null
	}

	// Get year range from the year field
	const yearRange = vehicleData.year || ''

	// Get model name without make (e.g., "Toyota 4Runner" -> "4Runner")
	const modelName = vehicleData.name.replace(vehicleData.make, '').trim()

	return (
		<>
			{/* Logo overlay */}
			<div className='absolute top-0 left-0 z-99 text-stone-900'>
				<Logo />
			</div>

			{/* Hero content overlay */}
			<div className='absolute inset-0 z-99 flex items-center justify-center pointer-events-auto'>
				<div className='wrapper'>
					<p className='mb-4 text-xl font-black uppercase tracking-widest'>{yearRange}</p>
					<h1 className='mb-12'>
						<span className='block mb-2'>{vehicleData.make}</span> <span className='block text-3xl sm:text-5xl md:text-7xl'>{modelName}</span>
					</h1>
					<button onClick={() => setInfoMode(false)} className='large'>
						Start Building
					</button>
				</div>
			</div>
		</>
	)
}

export default VehicleHero
