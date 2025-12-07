import { useState, useCallback } from 'react'
import classNames from 'classnames'
import useNetworkConnection from '../../hooks/useNetworkConnection'
import EditorSection from './EditorSection'
import PlayerList from './PlayerList'

import MultiplayerIcon from '../../assets/images/icons/Multiplayer.svg'
import CopyIcon from '../../assets/images/icons/Copy.svg'
import CheckIcon from '../../assets/images/icons/Check.svg'
import RefreshIcon from '../../assets/images/icons/Refresh.svg'

// Multiplayer panel component
function MultiplayerPanel() {
	const {
		connectionError,
		currentRoom,
		isHost,
		playerName,
		remotePlayers,
		serverAvailable,
		publicRooms,
		isConnected,
		isConnecting,
		isInRoom,
		remotePlayerCount,
		connect,
		createRoom,
		joinRoom,
		leaveRoom,
		setPlayerName,
		clearError,
		checkServerAvailability,
		setRoomPublic,
		fetchPublicRooms,
	} = useNetworkConnection()

	const [joinRoomId, setJoinRoomId] = useState('')
	const [copied, setCopied] = useState(false)

	// Handle copy room code
	const handleCopyRoomCode = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(currentRoom?.id)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch (err) {
			console.error('Failed to copy room code:', err)
		}
	}, [currentRoom?.id])

	// Handle name change on blur or enter
	const handleNameChange = useCallback(
		(e) => {
			const newName = e.target.value.trim()
			if (newName && newName !== playerName) {
				setPlayerName(newName)
			}
		},
		[playerName, setPlayerName]
	)

	// Handle create room
	const handleCreateRoom = useCallback(async () => {
		if (!isConnected) {
			const connected = await connect()
			if (!connected) return
		}
		await createRoom()
	}, [isConnected, connect, createRoom])

	// Handle join room
	const handleJoinRoom = useCallback(
		async (roomIdOverride) => {
			const roomIdToJoin = roomIdOverride || joinRoomId.trim()
			if (!roomIdToJoin) return

			if (!isConnected) {
				const connected = await connect()
				if (!connected) return
			}
			await joinRoom(roomIdToJoin)
			setJoinRoomId('')
		},
		[isConnected, connect, joinRoom, joinRoomId]
	)

	// Handle leave room
	const handleLeaveRoom = useCallback(() => {
		leaveRoom()
	}, [leaveRoom])

	// Get status text and color
	const getStatusInfo = () => {
		if (isInRoom) {
			return {
				text: remotePlayerCount === 0 ? 'Waiting for players...' : `In room with ${remotePlayerCount} player${remotePlayerCount !== 1 ? 's' : ''}`,
				color: 'text-green-400',
				dotColor: 'bg-green-500',
			}
		}
		if (isConnecting) {
			return {
				text: 'Connecting...',
				color: 'text-yellow-400',
				dotColor: 'bg-yellow-500 animate-pulse',
			}
		}
		if (isConnected) {
			return {
				text: 'Connected',
				color: 'text-blue-400',
				dotColor: 'bg-blue-500',
			}
		}
		// Server availability states when not connected
		if (serverAvailable === null) {
			return {
				text: 'Checking server...',
				color: 'text-yellow-400',
				dotColor: 'bg-yellow-500 animate-pulse',
			}
		}
		if (serverAvailable === false) {
			return {
				text: 'Server unavailable',
				color: 'text-red-400',
				dotColor: 'bg-red-500',
			}
		}
		return {
			text: 'Ready to connect',
			color: 'text-stone-400',
			dotColor: 'bg-stone-500',
		}
	}

	const status = getStatusInfo()

	return (
		<EditorSection title='Co-Op' icon={<MultiplayerIcon className='icon' />}>
			{/* Player Name */}
			<div className='field'>
				<label>User Name</label>
				<input type='text' defaultValue={playerName} onBlur={handleNameChange} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} maxLength={20} className='w-full' />
			</div>

			{/* Status */}
			<div className='field'>
				<label>Status</label>
				<div className='flex items-center gap-2 text-sm'>
					<span className={classNames('inline-block w-2 h-2 rounded-full', status.dotColor)} />
					<span className={status.color}>{status.text}</span>
				</div>
			</div>

			{/* Server unavailable message */}
			{serverAvailable === false && !isConnecting && (
				<div className='bg-stone-800/50 border border-stone-700 rounded p-3 text-sm'>
					<p className='text-stone-300 mb-2'>Unable to reach the multiplayer server. It may be starting up.</p>
					<button onClick={checkServerAvailability} className='w-full justify-center secondary'>
						Retry Connection
					</button>
				</div>
			)}

			{/* Checking server message */}
			{serverAvailable === null && <p className='text-stone-400 text-sm'>The server may take up to a minute to start if it has been inactive.</p>}

			{/* Connection Error */}
			{connectionError && (
				<div className='bg-red-900/50 border border-red-700 rounded p-3 text-red-200 text-sm flex gap-2 justify-between items-center'>
					<span>{connectionError}</span>
					<button onClick={clearError} className='secondary small'>
						×
					</button>
				</div>
			)}

			{isInRoom ? (
				<>
					{/* Room Code Display */}
					<div className='field'>
						<label>Room</label>
						<div className='flex gap-2'>
							<div className='flex-1 p-2 bg-stone-900 border border-stone-800 rounded text-center font-mono text-xl tracking-widest select-all text-white'>
								{currentRoom.id}
							</div>
							<button
								onClick={handleCopyRoomCode}
								className={classNames('secondary w-auto', { 'text-green-400': copied })}
								title={copied ? 'Copied!' : 'Copy room code'}>
								{copied ? <CheckIcon className='size-4' /> : <CopyIcon className='size-4' />}
							</button>
						</div>
						<p className='text-stone-500 text-xs mb-2'>Share this code with friends to play together</p>
					</div>

					{/* Public Room Toggle (Host only) */}
					{isHost && (
						<div className='field'>
							<label className='flex items-center justify-between cursor-pointer'>
								<span>Public Room</span>
								<div
									onClick={() => setRoomPublic(!currentRoom.isPublic)}
									className={classNames('relative w-11 h-6 rounded-full transition-colors', currentRoom.isPublic ? 'bg-green-600' : 'bg-stone-600')}>
									<span
										className={classNames(
											'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform',
											currentRoom.isPublic ? 'translate-x-5' : 'translate-x-0'
										)}
									/>
								</div>
							</label>
							<p className='text-xs text-stone-400 mt-1'>{currentRoom.isPublic ? 'Anyone can see and join this room' : 'Only players with the code can join'}</p>
						</div>
					)}

					{/* Player List */}
					<PlayerList players={remotePlayers} isHost={isHost} />

					{/* Leave Room Button */}
					<button onClick={handleLeaveRoom} className='justify-center'>
						Leave Room
					</button>
				</>
			) : (
				<>
					{/* Public Rooms List */}
					<div className='field'>
						<div className='flex items-end justify-between mb-2'>
							<label>Public Rooms</label>
							<RefreshIcon className='size-4 mb-2' onClick={fetchPublicRooms} title='Refresh rooms' />
						</div>
						<div className='flex flex-col gap-1 max-h-32 overflow-y-auto'>
							{publicRooms.length > 0 ? (
								publicRooms.map((room) => (
									<div
										key={room.id}
										onClick={() => handleJoinRoom(room.id)}
										disabled={isConnecting}
										className='flex items-center justify-between w-full px-3 py-2 bg-stone-800 hover:bg-stone-700 rounded text-sm transition-colors cursor-pointer'>
										<span className='font-mono'>{room.id}</span>
										<span className='text-stone-400'>
											{room.playerCount}/{room.maxPlayers} players
										</span>
									</div>
								))
							) : (
								<p className='text-stone-500 text-sm py-2'>No public rooms available</p>
							)}
						</div>
					</div>

					{/* Join Room */}
					<div className='field'>
						<label>Join With Code</label>
						<div className='flex gap-2 items-center'>
							<input
								type='text'
								value={joinRoomId}
								onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
								onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
								placeholder='Room code'
								maxLength={8}
								className='w-full'
							/>
							<button
								onClick={handleJoinRoom}
								disabled={!joinRoomId.trim() || isConnecting || serverAvailable === null}
								className={classNames('small', { 'opacity-50 cursor-not-allowed': !joinRoomId.trim() || isConnecting || serverAvailable === null })}>
								Join
							</button>
						</div>
					</div>

					{/* Create Room */}
					<div className='field'>
						<label>Or Create New Room</label>
						<button
							onClick={handleCreateRoom}
							disabled={isConnecting || serverAvailable === null}
							className={classNames('w-full justify-center', { 'opacity-50 cursor-not-allowed': isConnecting || serverAvailable === null })}>
							{isConnecting ? 'Connecting...' : 'Create Room'}
						</button>
					</div>
				</>
			)}
		</EditorSection>
	)
}
export default MultiplayerPanel
