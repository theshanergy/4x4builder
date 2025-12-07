import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import useMultiplayerStore from '../../store/multiplayerStore'
import useGameStore from '../../store/gameStore'
import ChatIcon from '../../assets/images/icons/Chat.svg'

// How long messages stay visible when chat is not focused
const MESSAGE_FADE_DELAY = 8000

// Chat message component
const ChatMessage = memo(({ message, opacity, playerColor }) => (
	<div className='mb-2 leading-6 text-sm transition-opacity duration-1000' style={{ opacity }}>
		<span className='font-semibold' style={{ color: playerColor || '#3b82f6' }}>
			{message.playerName}:
		</span>{' '}
		{message.text}
	</div>
))
ChatMessage.displayName = 'ChatMessage'

// Main chat component
const Chat = () => {
	const [inputValue, setInputValue] = useState('')
	const [messagesVisible, setMessagesVisible] = useState(false)
	const inputRef = useRef(null)
	const messagesEndRef = useRef(null)
	const fadeTimerRef = useRef(null)

	const chatMessages = useMultiplayerStore((state) => state.chatMessages)
	const currentRoom = useMultiplayerStore((state) => state.currentRoom)
	const sendChatMessage = useMultiplayerStore((state) => state.sendChatMessage)
	const remotePlayers = useMultiplayerStore((state) => state.remotePlayers)
	const chatOpen = useMultiplayerStore((state) => state.chatOpen)
	const setChatOpen = useMultiplayerStore((state) => state.setChatOpen)
	const localVehicleColor = useGameStore((state) => state.currentVehicle?.color)

	// Memoize player colors to avoid recalculating when other player data changes
	const playerColors = useMemo(() => {
		const colors = {}
		for (const [id, player] of Object.entries(remotePlayers)) {
			colors[id] = player?.vehicleConfig?.color
		}
		return colors
	}, [remotePlayers])

	// Get player color by ID
	const getPlayerColor = useCallback(
		(playerId, isLocal) => {
			if (isLocal) return localVehicleColor
			return playerColors[playerId]
		},
		[playerColors, localVehicleColor]
	)

	// Show messages and schedule fade
	const showMessages = useCallback(() => {
		setMessagesVisible(true)

		// Clear existing timer
		if (fadeTimerRef.current) {
			clearTimeout(fadeTimerRef.current)
		}

		// Schedule fade out (only if not focused)
		fadeTimerRef.current = setTimeout(() => {
			setMessagesVisible(false)
		}, MESSAGE_FADE_DELAY)
	}, [])

	// Show messages when new ones arrive
	useEffect(() => {
		if (chatMessages.length > 0) {
			showMessages()
		}
	}, [chatMessages.length, showMessages])

	// Handle focus state
	useEffect(() => {
		if (chatOpen) {
			// Clear fade timer and show messages when focused
			if (fadeTimerRef.current) {
				clearTimeout(fadeTimerRef.current)
			}
			setMessagesVisible(true)
		} else {
			// Start fade timer when unfocused
			showMessages()
		}
	}, [chatOpen, showMessages])

	// Handle keyboard shortcut (T to open chat, Escape to close)
	useEffect(() => {
		const handleKeyDown = (e) => {
			// Don't intercept if already in an input
			if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
				if (e.key === 'Escape') {
					inputRef.current?.blur()
					setChatOpen(false)
				}
				return
			}

			// T or Enter to open chat when in a room
			if ((e.key === 't' || e.key === 'T' || e.key === 'Enter') && currentRoom) {
				e.preventDefault()
				inputRef.current?.focus()
				setChatOpen(true)
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [currentRoom, setChatOpen])

	// Handle send message
	const handleSubmit = useCallback(
		(e) => {
			e.preventDefault()
			if (inputValue.trim()) {
				sendChatMessage(inputValue.trim())
				setInputValue('')
			}
			// Keep input focused after sending
		},
		[inputValue, sendChatMessage]
	)

	// Handle input focus/blur
	const handleFocus = useCallback(() => {
		setChatOpen(true)
	}, [setChatOpen])

	const handleBlur = useCallback(() => {
		setChatOpen(false)
	}, [setChatOpen])

	// Scroll to bottom when new messages arrive
	useEffect(() => {
		if (chatOpen) {
			messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
		}
	}, [chatMessages, chatOpen])

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (fadeTimerRef.current) {
				clearTimeout(fadeTimerRef.current)
			}
		}
	}, [])

	// Memoize messages to display (last 8 when not focused, all when focused)
	const displayMessages = useMemo(() => (chatOpen ? chatMessages : chatMessages.slice(-8)), [chatOpen, chatMessages])

	// Memoize opacity value to pass as primitive instead of inline style object
	const messageOpacity = chatOpen || messagesVisible ? 1 : 0

	// Don't render if not in a room
	if (!currentRoom) return null

	return (
		<div className='fixed top-18 right-4 z-40 w-100'>
			{/* Chat toggle button */}
			<div
				className='flex items-center gap-2 text-white/50 text-sm drop-shadow-sm cursor-pointer hover:text-white transition-colors justify-end mb-2'
				onMouseDown={(e) => {
					e.preventDefault()
				}}
				onClick={() => {
					if (chatOpen) {
						inputRef.current?.blur()
						setChatOpen(false)
					} else {
						inputRef.current?.focus()
						setChatOpen(true)
					}
				}}>
				<ChatIcon className='size-5 max-lg:size-7' />
				<span className='max-lg:hidden'>{chatOpen ? 'Close chat' : 'Press T to chat'}</span>
			</div>

			{/* Messages container */}
			<div className={`flex flex-col gap-1 mb-2 max-h-64 overflow-hidden ${chatOpen ? 'overflow-y-auto scrollbar-none' : ''}`}>
				{displayMessages.map((message) => (
					<ChatMessage key={message.id} message={message} opacity={messageOpacity} playerColor={getPlayerColor(message.playerId, message.isLocal)} />
				))}
				<div ref={messagesEndRef} />
			</div>

			{/* Input field */}
			<form onSubmit={handleSubmit} className='pointer-events-auto'>
				<div className={`transition-opacity duration-200 ${chatOpen ? 'opacity-100' : 'opacity-0'}`}>
					<input
						ref={inputRef}
						type='text'
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onFocus={handleFocus}
						onBlur={handleBlur}
						placeholder='Type a message...'
						maxLength={200}
						className='w-full bg-black/50 backdrop-blur-sm border-none text-white text-sm placeholder:text-white/40'
					/>
				</div>
			</form>
		</div>
	)
}

export default memo(Chat)
