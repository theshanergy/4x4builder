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

// Status message component
function StatusMessage({ message, type = 'info' }) {
	const bgColor = type === 'error' ? 'bg-red-900/50' : 'bg-blue-900/20'
	const borderColor = type === 'error' ? 'border-red-700' : 'border-blue-700/20'
	const textColor = type === 'error' ? 'text-red-200' : 'text-blue-200'

	return (
		<div className={`${bgColor} border ${borderColor} rounded p-3 ${textColor} text-sm`}>
			<div className='flex items-start gap-3'>
				{type !== 'error' && (
					<div className='shrink-0 mt-0.5'>
						<div className='w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin' />
					</div>
				)}
				<div>
					<p className='font-semibold'>{message}</p>
				</div>
			</div>
		</div>
	)
}

// Multiplayer panel component
function MultiplayerPanel() {
	const { connectionError, currentRoom, playerName, remotePlayers, isConnecting, isInRoom, joinRoom, leaveRoom, setPlayerName } = useNetworkConnection()

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

	// Handle connect to lobby
	const handleConnectToLobby = useCallback(() => {
		joinRoom(LOBBY_ROOM_ID)
	}, [joinRoom])

	// Handle join room by ID or create new room
	const handleJoinRoom = useCallback(() => {
		const roomIdToJoin = joinRoomId.trim()
		joinRoom(roomIdToJoin || null)
		if (roomIdToJoin) setJoinRoomId('')
	}, [joinRoom, joinRoomId])

	// Handle leave room
	const handleLeaveRoom = useCallback(() => {
		leaveRoom()
	}, [leaveRoom])

	return (
		<EditorSection title='Co-Op' icon={<MultiplayerIcon className='icon' />}>
			{/* Player Name */}
			<div className='field'>
				<label>User Name</label>
				<input type='text' defaultValue={playerName} onBlur={handleNameChange} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} maxLength={20} className='w-full' />
			</div>

			{/* Status Messages */}
			{isConnecting && <StatusMessage message='Connecting to server...' />}
			{connectionError && <StatusMessage message={connectionError} type='error' />}

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
						disabled={isConnecting}
						className={classNames('justify-center bg-green-600 hover:bg-green-500 text-white font-semibold py-3', {
							'opacity-50 cursor-not-allowed': isConnecting,
						})}>
						{isConnecting ? 'Connecting...' : 'Connect to Lobby'}
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
								placeholder='ROOM CODE'
								maxLength={8}
								className='w-full'
							/>
							<button onClick={handleJoinRoom} disabled={isConnecting} className={classNames('small', { 'opacity-50 cursor-not-allowed': isConnecting })}>
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
