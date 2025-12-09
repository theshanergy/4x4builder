import { useState, useCallback } from 'react'
import classNames from 'classnames'
import useNetworkConnection from '../../hooks/useNetworkConnection'
import EditorSection from './EditorSection'
import PlayerList from './PlayerList'

import MultiplayerIcon from '../../assets/images/icons/Multiplayer.svg'
import CopyIcon from '../../assets/images/icons/Copy.svg'
import CheckIcon from '../../assets/images/icons/Check.svg'

// Lobby room ID - shared room that everyone can join from the UI
const LOBBY_ROOM_ID = 'LOBBY'

// Multiplayer panel component
function MultiplayerPanel() {
	const {
		connectionError,
		currentRoom,
		playerName,
		remotePlayers,
		serverAvailable,
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
	} = useNetworkConnection()

	const [joinRoomId, setJoinRoomId] = useState('')
	const [copied, setCopied] = useState(false)
	const [waitingForServer, setWaitingForServer] = useState(false)

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

	// Handle connect to lobby
	const handleConnectToLobby = useCallback(async () => {
		// If server not available yet, show waiting message
		if (serverAvailable !== true) {
			setWaitingForServer(true)
			// Keep checking until server is available
			const checkInterval = setInterval(async () => {
				const available = await checkServerAvailability()
				if (available) {
					clearInterval(checkInterval)
					setWaitingForServer(false)
					// Now connect
					const connected = await connect()
					if (connected) {
						await joinRoom(LOBBY_ROOM_ID)
					}
				}
			}, 2000)
			return
		}

		if (!isConnected) {
			const connected = await connect()
			if (!connected) return
		}
		await joinRoom(LOBBY_ROOM_ID)
	}, [serverAvailable, isConnected, connect, joinRoom, checkServerAvailability])

	// Handle join room by ID or create new room
	const handleJoinRoom = useCallback(async () => {
		const roomIdToJoin = joinRoomId.trim()

		// If server not available yet, show waiting message
		if (serverAvailable !== true) {
			setWaitingForServer(true)
			// Keep checking until server is available
			const checkInterval = setInterval(async () => {
				const available = await checkServerAvailability()
				if (available) {
					clearInterval(checkInterval)
					setWaitingForServer(false)
					// Now connect and join/create
					const connected = await connect()
					if (connected) {
						if (roomIdToJoin) {
							await joinRoom(roomIdToJoin)
							setJoinRoomId('')
						} else {
							await createRoom()
						}
					}
				}
			}, 2000)
			return
		}

		if (!isConnected) {
			const connected = await connect()
			if (!connected) return
		}

		if (roomIdToJoin) {
			await joinRoom(roomIdToJoin)
			setJoinRoomId('')
		} else {
			await createRoom()
		}
	}, [serverAvailable, isConnected, connect, joinRoom, createRoom, joinRoomId, checkServerAvailability])

	// Handle leave room
	const handleLeaveRoom = useCallback(() => {
		leaveRoom()
	}, [leaveRoom])

	// Get status text and color (only shown when in room)
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
		return null
	}

	const status = getStatusInfo()

	return (
		<EditorSection title='Co-Op' icon={<MultiplayerIcon className='icon' />} onExpand={checkServerAvailability}>
			{/* Player Name */}
			<div className='field'>
				<label>User Name</label>
				<input type='text' defaultValue={playerName} onBlur={handleNameChange} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} maxLength={20} className='w-full' />
			</div>

			{/* Status - only show when connecting or in room */}
			{status && (
				<div className='field'>
					<label>Status</label>
					<div className='flex items-center gap-2 text-sm'>
						<span className={classNames('inline-block w-2 h-2 rounded-full', status.dotColor)} />
						<span className={status.color}>{status.text}</span>
					</div>
				</div>
			)}

			{/* Waiting for server message */}
			{waitingForServer && (
				<div className='bg-amber-900/50 border border-amber-700 rounded p-3 text-amber-200 text-sm'>
					<p>You're the first one here! Please wait a moment for the server to start up...</p>
				</div>
			)}

			{/* Connection Error */}
			{connectionError && (
				<div className='bg-red-900/50 border border-red-700 rounded p-3 text-red-200 text-sm flex gap-2 justify-between items-center'>
					<span>{connectionError}</span>
					<button onClick={clearError} className='secondary small'>
						×
					</button>
				</div>
			)}

			{/* Room controls */}
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

					{/* Player List */}
					<PlayerList players={remotePlayers} />

					{/* Leave Room Button */}
					<button onClick={handleLeaveRoom} className='justify-center'>
						Leave Room
					</button>
				</>
			) : (
				<>
					{/* Connect to Lobby Button */}
					<button
						onClick={handleConnectToLobby}
						disabled={isConnecting || waitingForServer}
						className={classNames('justify-center bg-green-600 hover:bg-green-500 text-white font-semibold py-3', {
							'opacity-50 cursor-not-allowed': isConnecting || waitingForServer,
						})}>
						{isConnecting ? 'Connecting...' : waitingForServer ? 'Starting server...' : 'Connect to Lobby'}
					</button>

					{/* OR separator */}
					<div className='flex items-center gap-3 my-2'>
						<div className='flex-1 border-t border-stone-700' />
						<span className='text-stone-500 text-sm'>OR</span>
						<div className='flex-1 border-t border-stone-700' />
					</div>

					{/* Join or Create Room */}
					<div className='field'>
						<label>Join or Create Private Room</label>
						<div className='flex gap-2 items-center'>
							<input
								type='text'
								value={joinRoomId}
								onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
								onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
								placeholder='Enter code or leave blank to create'
								maxLength={8}
								className='w-full'
							/>
							<button
								onClick={handleJoinRoom}
								disabled={isConnecting || waitingForServer}
								className={classNames('small', { 'opacity-50 cursor-not-allowed': isConnecting || waitingForServer })}>
								{isConnecting ? '...' : joinRoomId.trim() ? 'Join' : 'Create'}
							</button>
						</div>
					</div>
				</>
			)}
		</EditorSection>
	)
}
export default MultiplayerPanel
