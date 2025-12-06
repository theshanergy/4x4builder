import { useState, useCallback, useEffect } from 'react'
import classNames from 'classnames'
import useNetworkConnection from '../../hooks/useNetworkConnection'
import EditorSection from './EditorSection'
import RoomCode from './RoomCode'
import PlayerList from './PlayerList'

import MultiplayerIcon from '../../assets/images/icons/Multiplayer.svg'

// Multiplayer panel component
function MultiplayerPanel() {
	const {
		connectionState,
		connectionError,
		currentRoom,
		isHost,
		playerName,
		remotePlayers,
		serverAvailable,
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
		checkServerAvailability,
	} = useNetworkConnection()

	const [joinRoomId, setJoinRoomId] = useState('')

	// Check server availability on mount
	useEffect(() => {
		checkServerAvailability()
	}, [checkServerAvailability])

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

	// Don't render if server is not available
	if (serverAvailable !== true) {
		return null
	}

	// Get status text and color
	const getStatusInfo = () => {
		if (isInRoom) {
			return {
				text: `In room with ${remotePlayerCount + 1} player${remotePlayerCount !== 0 ? 's' : ''}`,
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
				text: 'Connected to server',
				color: 'text-blue-400',
				dotColor: 'bg-blue-500',
			}
		}
		return {
			text: 'Not connected',
			color: 'text-stone-400',
			dotColor: 'bg-stone-500',
		}
	}

	const status = getStatusInfo()

	return (
		<EditorSection title='Multiplayer' icon={<MultiplayerIcon className='icon' />}>
			{/* Status */}
			<div className='field'>
				<label>Status</label>
				<div className='flex items-center gap-2 text-sm'>
					<span className={classNames('inline-block w-2 h-2 rounded-full', status.dotColor)} />
					<span className={status.color}>{status.text}</span>
				</div>
			</div>

			{/* Connection Error */}
			{connectionError && (
				<div className='bg-red-900/50 border border-red-700 rounded p-3 text-red-200 text-sm flex gap-2 justify-between items-center'>
					<span>{connectionError}</span>
					<button onClick={clearError} className='secondary small'>
						×
					</button>
				</div>
			)}

			{/* Player Name */}
			<div className='field'>
				<label>Your Name</label>
				<input type='text' defaultValue={playerName} onBlur={handleNameChange} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} maxLength={20} className='w-full' />
			</div>

			{isInRoom ? (
				<>
					{/* Room Code Display */}
					<RoomCode roomId={currentRoom.id} isHost={isHost} />

					{/* Player List */}
					<PlayerList players={remotePlayers} isHost={isHost} />

					{/* Leave Room Button */}
					<button onClick={handleLeaveRoom} className='justify-center'>
						Leave Room
					</button>
				</>
			) : (
				<>
					{/* Join Room */}
					<div className='field'>
						<label>Join Room</label>
						<div className='flex gap-2'>
							<input
								type='text'
								value={joinRoomId}
								onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
								onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
								placeholder='CODE'
								maxLength={8}
								className='w-full uppercase'
							/>
							<button
								onClick={handleJoinRoom}
								disabled={!joinRoomId.trim() || isConnecting}
								className={classNames({ 'opacity-50 cursor-not-allowed': !joinRoomId.trim() || isConnecting })}>
								Join
							</button>
						</div>
					</div>

					{/* Create Room */}
					<div className='field'>
						<label>New Room</label>
						<button
							onClick={handleCreateRoom}
							disabled={isConnecting}
							className={classNames('w-full justify-center', { 'opacity-50 cursor-not-allowed': isConnecting })}>
							{isConnecting ? 'Connecting...' : 'Create Room'}
						</button>
					</div>

					{/* Disconnect button when connected but not in room */}
					{isConnected && (
						<button onClick={handleDisconnect} className='w-full secondary'>
							Disconnect
						</button>
					)}
				</>
			)}
		</EditorSection>
	)
}
export default MultiplayerPanel
