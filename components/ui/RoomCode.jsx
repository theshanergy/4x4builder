import { useState, useCallback } from 'react'
import classNames from 'classnames'

// Copy icon
const CopyIcon = (
	<svg className='size-4' viewBox='0 0 24 24' fill='currentColor'>
		<path d='M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z' />
	</svg>
)

// Check icon
const CheckIcon = (
	<svg className='size-4' viewBox='0 0 24 24' fill='currentColor'>
		<path d='M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z' />
	</svg>
)

// Room code display component with copy functionality
function RoomCode({ roomId, isHost }) {
	const [copied, setCopied] = useState(false)
	
	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(roomId)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch (err) {
			console.error('Failed to copy room code:', err)
		}
	}, [roomId])
	
	return (
		<div className='field'>
			<div className='flex justify-between items-center mb-2'>
				<label className='mb-0'>Room Code</label>
				{isHost && <span className='text-xs text-yellow-500 font-bold'>HOST</span>}
			</div>
			<div className='flex gap-2'>
				<div className='flex-1 p-2 bg-stone-900 border border-stone-800 rounded text-center font-mono text-xl tracking-widest select-all text-white'>
					{roomId}
				</div>
				<button
					onClick={handleCopy}
					className={classNames('secondary w-auto px-3', { 'text-green-400': copied })}
					title={copied ? 'Copied!' : 'Copy room code'}
				>
					{copied ? CheckIcon : CopyIcon}
				</button>
			</div>
			<p className='text-stone-500 text-xs mt-2'>
				Share this code with friends to play together
			</p>
		</div>
	)
}

export default RoomCode
