// Player list component showing all connected players
function PlayerList({ players, isHost }) {
	const playerArray = Object.values(players)
	
	if (playerArray.length === 0) {
		return (
			<div className='bg-stone-800/50 rounded-lg p-4 text-center'>
				<p className='text-stone-500 text-sm'>
					No other players yet. Share the room code to invite friends!
				</p>
			</div>
		)
	}
	
	return (
		<div className='flex flex-col gap-2'>
			<div className='flex items-center justify-between'>
				<span className='text-stone-500 text-sm'>Players in Room</span>
				<span className='text-stone-600 text-xs'>{playerArray.length + 1} total</span>
			</div>
			<div className='bg-stone-800/50 rounded-lg divide-y divide-stone-700/50'>
				{/* Local player (you) */}
				<div className='flex items-center gap-3 px-4 py-3'>
					<div className='w-2 h-2 rounded-full bg-green-500' />
					<span className='text-white text-sm'>You</span>
					{isHost && (
						<span className='text-xs bg-yellow-600/30 text-yellow-400 px-2 py-0.5 rounded ml-auto'>
							Host
						</span>
					)}
				</div>
				
				{/* Remote players */}
				{playerArray.map((player) => (
					<div key={player.id} className='flex items-center gap-3 px-4 py-3'>
						<div className='w-2 h-2 rounded-full bg-blue-500' />
						<span className='text-white text-sm'>{player.name}</span>
						{player.vehicleConfig?.body && (
							<span className='text-stone-500 text-xs ml-auto'>
								{formatVehicleName(player.vehicleConfig.body)}
							</span>
						)}
					</div>
				))}
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
