import useGameStore from '../../store/gameStore'

// Single player row component
function PlayerRow({ name, color, vehicleName, isHost, isLocal }) {
	return (
		<div className='flex items-center gap-2 p-2 bg-stone-900/50 rounded border border-stone-800/50'>
			<div className='w-2 h-2 rounded-full' style={{ backgroundColor: color || '#3b82f6' }} />
			<span className={`text-sm text-white ${isLocal ? 'font-medium' : ''}`}>{name}</span>
			{isHost && <span className='text-xs text-yellow-500 ml-auto font-bold'>HOST</span>}
			{!isHost && vehicleName && <span className='text-xs text-stone-500 ml-auto'>{vehicleName}</span>}
		</div>
	)
}

// Format vehicle body ID to readable name
function formatVehicleName(bodyId) {
	if (!bodyId) return ''
	return bodyId
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
}

// Player list component showing all connected players
function PlayerList({ players, isHost }) {
	const playerArray = Object.values(players)
	const currentVehicle = useGameStore((state) => state.currentVehicle)

	return (
		<div className='field'>
			<label>Players ({playerArray.length + 1})</label>
			<div className='flex flex-col gap-1'>
				<PlayerRow name='You' color={currentVehicle.color} isHost={isHost} isLocal />

				{playerArray.map((player) => (
					<PlayerRow key={player.id} name={player.name} color={player.vehicleConfig?.color} vehicleName={formatVehicleName(player.vehicleConfig?.body)} />
				))}

				{playerArray.length === 0 && <div className='text-stone-500 text-xs italic p-2 text-center'>Waiting for players...</div>}
			</div>
		</div>
	)
}

export default PlayerList
