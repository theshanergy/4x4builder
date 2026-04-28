import { useState, useEffect, useRef } from 'react'
import useGameStore from '../../store/gameStore'
import useInputStore from '../../store/inputStore'

// Available commands
const COMMANDS = {
	drone: {
		description: 'Switch to drone camera mode',
		action: (setCameraMode) => setCameraMode('drone'),
	},
}

const DevConsole = () => {
	const [open, setOpen] = useState(false)
	const [input, setInput] = useState('')
	const [suggestion, setSuggestion] = useState(null)
	const [error, setError] = useState(null)
	const inputRef = useRef(null)

	const setCameraMode = useGameStore((state) => state.setCameraMode)
	const setTextInputActive = useInputStore((state) => state.setTextInputActive)

	// Block vehicle input while console is open
	useEffect(() => {
		setTextInputActive(open)
	}, [open, setTextInputActive])
	useEffect(() => {
		const handleKeyDown = (e) => {
			if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault()
				setOpen((prev) => {
					if (!prev) {
						// Reset state on open
						setInput('')
						setSuggestion(null)
						setError(null)
					}
					return !prev
				})
			}
			if (e.key === 'Escape') {
				setOpen(false)
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [])

	// Focus input when opened
	useEffect(() => {
		if (open) {
			setTimeout(() => inputRef.current?.focus(), 50)
		}
	}, [open])

	// Update suggestion as user types
	const handleChange = (e) => {
		const val = e.target.value
		setInput(val)
		setError(null)

		if (val.trim()) {
			const match = Object.keys(COMMANDS).find((cmd) => cmd.startsWith(val.trim().toLowerCase()))
			setSuggestion(match || null)
		} else {
			setSuggestion(null)
		}
	}

	// Execute command
	const runCommand = (cmdStr) => {
		const cmd = cmdStr.trim().toLowerCase()
		if (!cmd) return

		if (COMMANDS[cmd]) {
			COMMANDS[cmd].action(setCameraMode)
			setOpen(false)
		} else {
			setError(`Unknown command: "${cmd}"`)
		}
	}

	const handleKeyDown = (e) => {
		if (e.key === 'Enter') {
			runCommand(input)
		} else if (e.key === 'Tab' && suggestion) {
			e.preventDefault()
			setInput(suggestion)
			setSuggestion(null)
		}
	}

	if (!open) return null

	return (
		<div className='fixed inset-0 z-100' onClick={() => setOpen(false)}>
			<div className='absolute top-12 left-0 right-0 flex justify-center px-4'>
				<div className='w-full max-w-sm animate-pop-in' onClick={(e) => e.stopPropagation()}>
					<div className='bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-2xl'>
						{/* Input row */}
						<div className='flex items-center gap-3 px-4 py-3'>
							<span className='text-white/30 text-xs font-mono select-none'>&gt;</span>
							<div className='relative flex-1'>
								{/* Ghost suggestion */}
								{suggestion && input && (
									<span className='absolute inset-0 flex items-center text-sm font-mono pointer-events-none'>
										<span className='text-transparent'>{input}</span>
										<span className='text-white/25'>{suggestion.slice(input.length)}</span>
									</span>
								)}
								<input
									ref={inputRef}
									type='text'
									value={input}
									onChange={handleChange}
									onKeyDown={handleKeyDown}
									placeholder='enter command...'
									spellCheck={false}
									autoComplete='off'
									className='w-full bg-transparent text-white text-sm font-mono outline-none placeholder:text-white/20 caret-white/60'
								/>
							</div>
							{suggestion && <span className='text-white/20 text-xs font-mono hidden sm:block'>tab</span>}
						</div>

						{/* Error message */}
						{error && <div className='px-4 pb-3 text-red-400 text-xs font-mono'>{error}</div>}

						{/* Command hint */}
						{!error && suggestion && COMMANDS[suggestion] && (
							<div className='border-t border-white/5 px-4 py-2 flex items-center justify-between'>
								<span className='text-white/60 text-xs font-mono'>{suggestion}</span>
								<span className='text-white/30 text-xs'>{COMMANDS[suggestion].description}</span>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

export default DevConsole
