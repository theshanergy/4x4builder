// Player list component showing all connected players
function PlayerList({ players, isHost }) {
	const playerArray = Object.values(players)
	
	return (
		<div className='field'>
			<label>Players ({playerArray.length + 1})</label>
			<div className='flex flex-col gap-1'>
				{/* Local player (you) */}
				<div className='flex items-center gap-2 p-2 bg-stone-900/50 rounded border border-stone-800/50'>
					<div className='w-2 h-2 rounded-full bg-green-500' />
					<span className='text-sm font-medium text-white'>You</span>
					{isHost && <span className='text-xs text-yellow-500 ml-auto font-bold'>HOST</span>}
				</div>
				
				{/* Remote players */}
				{playerArray.map((player) => (
					<div key={player.id} className='flex items-center gap-2 p-2 bg-stone-900/50 rounded border border-stone-800/50'>
						<div className='w-2 h-2 rounded-full bg-blue-500' />
						<span className='text-sm text-white'>{player.name}</span>
						{player.vehicleConfig?.body && (
							<span className='text-xs text-stone-500 ml-auto'>
								{formatVehicleName(player.vehicleConfig.body)}
							</span>
						)}
					</div>
				))}
				
				{playerArray.length === 0 && (
					<div className='text-stone-500 text-xs italic p-2 text-center'>
						Waiting for players...
					</div>
				)}
			</div>
		</div>
	)
}

// Format vehicle body ID to readable name
function formatVehicleName(bodyId) {
	if (!bodyId) return ''
	// Convert underscores to spaces and capitalize words
	return bodyId
		.split('_')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
}

export default PlayerList
