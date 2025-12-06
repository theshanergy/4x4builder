import { useState, useCallback } from 'react'
import classNames from 'classnames'
import useNetworkConnection from '../../hooks/useNetworkConnection'
import RoomCode from './RoomCode'
import PlayerList from './PlayerList'

// Icons
const MultiplayerIcon = (
	<svg className='icon fill-blue-400 size-4' viewBox='0 0 24 24'>
		<path d='M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' />
	</svg>
)

const ConnectionIcon = ({ connected, connecting }) => (
	<span className={classNames(
		'inline-block w-2 h-2 rounded-full mr-2',
		connected ? 'bg-green-500' : connecting ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
	)} />
)

// Multiplayer panel component
function MultiplayerPanel() {
	const {
		connectionState,
		connectionError,
		currentRoom,
		isHost,
		playerName,
		remotePlayers,
		isConnected,
		isConnecting,
		isInRoom,
		remotePlayerCount,
		connect,
		disconnect,
		createRoom,
		joinRoom,
		leaveRoom,
		setPlayerName,
		clearError,
	} = useNetworkConnection()
	
	const [joinRoomId, setJoinRoomId] = useState('')
	const [editingName, setEditingName] = useState(false)
	const [nameInput, setNameInput] = useState(playerName)
	const [isExpanded, setIsExpanded] = useState(false)
	
	// Handle name change
	const handleNameSubmit = useCallback(() => {
		if (nameInput.trim()) {
			setPlayerName(nameInput.trim())
		}
		setEditingName(false)
	}, [nameInput, setPlayerName])
	
	// Handle create room
	const handleCreateRoom = useCallback(async () => {
		if (!isConnected) {
			const connected = await connect()
			if (!connected) return
		}
		await createRoom()
	}, [isConnected, connect, createRoom])
	
	// Handle join room
	const handleJoinRoom = useCallback(async () => {
		if (!joinRoomId.trim()) return
		
		if (!isConnected) {
			const connected = await connect()
			if (!connected) return
		}
		await joinRoom(joinRoomId.trim())
		setJoinRoomId('')
	}, [isConnected, connect, joinRoom, joinRoomId])
	
	// Handle leave room
	const handleLeaveRoom = useCallback(() => {
		leaveRoom()
	}, [leaveRoom])
	
	// Handle disconnect
	const handleDisconnect = useCallback(() => {
		disconnect()
	}, [disconnect])
	
	// Toggle expand
	const toggleExpand = useCallback(() => {
		setIsExpanded(!isExpanded)
	}, [isExpanded])
	
	return (
		<div className='section'>
			{/* Header */}
			<div 
				className='flex gap-4 items-center px-5 py-4 bg-stone-900/60 text-white/80 uppercase text-sm font-bold cursor-pointer'
				onClick={toggleExpand}
			>
				{MultiplayerIcon}
				Multiplayer
				<div className='ml-auto flex items-center gap-2'>
					<ConnectionIcon connected={isConnected} connecting={isConnecting} />
					{isInRoom && (
						<span className='text-xs font-normal normal-case text-stone-400'>
							{remotePlayerCount + 1} player{remotePlayerCount !== 0 ? 's' : ''}
						</span>
					)}
					<svg 
						aria-hidden='true' 
						viewBox='0 0 24 24' 
						className={classNames('icon fill-stone-600 size-5', { 'rotate-180': isExpanded })}
					>
						<path d='M16.6 8.6L12 13.2 7.4 8.6 6 10l6 6 6-6z' />
					</svg>
				</div>
			</div>
			
			{/* Content */}
			<div className={classNames('p-4 flex flex-col gap-4 text-md', { hidden: !isExpanded })}>
				{/* Connection Error */}
				{connectionError && (
					<div className='bg-red-900/50 border border-red-700 rounded p-3 text-red-200 text-sm flex justify-between items-center'>
						<span>{connectionError}</span>
						<button 
							onClick={clearError}
							className='text-red-400 hover:text-red-200 ml-2'
						>
							×
						</button>
					</div>
				)}
				
				{/* Player Name */}
				<div className='flex flex-col gap-2'>
					<label className='text-stone-500 text-sm'>Your Name</label>
					{editingName ? (
						<div className='flex gap-2'>
							<input
								type='text'
								value={nameInput}
								onChange={(e) => setNameInput(e.target.value)}
								onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
								maxLength={20}
								className='flex-1 bg-stone-800 border border-stone-700 rounded px-3 py-2 text-white'
								autoFocus
							/>
							<button
								onClick={handleNameSubmit}
								className='px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white'
							>
								Save
							</button>
						</div>
					) : (
						<div 
							onClick={() => { setNameInput(playerName); setEditingName(true) }}
							className='bg-stone-800 border border-stone-700 rounded px-3 py-2 text-white cursor-pointer hover:border-stone-600'
						>
							{playerName}
						</div>
					)}
				</div>
				
				{isInRoom ? (
					<>
						{/* Room Code Display */}
						<RoomCode roomId={currentRoom.id} isHost={isHost} />
						
						{/* Player List */}
						<PlayerList players={remotePlayers} isHost={isHost} />
						
						{/* Leave Room Button */}
						<button
							onClick={handleLeaveRoom}
							className='w-full py-3 bg-red-600/80 hover:bg-red-600 rounded text-white font-bold uppercase text-sm'
						>
							Leave Room
						</button>
					</>
				) : (
					<>
						{/* Create Room */}
						<button
							onClick={handleCreateRoom}
							disabled={isConnecting}
							className={classNames(
								'w-full py-3 rounded text-white font-bold uppercase text-sm',
								isConnecting 
									? 'bg-stone-700 cursor-not-allowed' 
									: 'bg-blue-600/80 hover:bg-blue-600'
							)}
						>
							{isConnecting ? 'Connecting...' : 'Create Room'}
						</button>
						
						{/* Join Room */}
						<div className='flex flex-col gap-2'>
							<label className='text-stone-500 text-sm'>Join Room</label>
							<div className='flex gap-2'>
								<input
									type='text'
									value={joinRoomId}
									onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
									onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
									placeholder='Enter room code'
									maxLength={8}
									className='flex-1 bg-stone-800 border border-stone-700 rounded px-3 py-2 text-white uppercase placeholder:text-stone-600 placeholder:normal-case'
								/>
								<button
									onClick={handleJoinRoom}
									disabled={!joinRoomId.trim() || isConnecting}
									className={classNames(
										'px-4 py-2 rounded text-white font-bold',
										!joinRoomId.trim() || isConnecting
											? 'bg-stone-700 cursor-not-allowed'
											: 'bg-green-600/80 hover:bg-green-600'
									)}
								>
									Join
								</button>
							</div>
						</div>
						
						{/* Disconnect button when connected but not in room */}
						{isConnected && (
							<button
								onClick={handleDisconnect}
								className='w-full py-2 bg-stone-700 hover:bg-stone-600 rounded text-stone-300 text-sm'
							>
								Disconnect
							</button>
						)}
					</>
				)}
			</div>
		</div>
	)
}

export default MultiplayerPanel
