import { useEffect, useState, useRef } from 'react'
import useGameStore from '../../store/gameStore'
import CheckIcon from '../../assets/images/icons/Check.svg'

// Notification component
const Notification = () => {
	const notification = useGameStore((state) => state.notification)
	const hideNotification = useGameStore((state) => state.hideNotification)

	const [inputValue, setInputValue] = useState('')
	const inputRef = useRef(null)

	// Reset input value when notification changes
	useEffect(() => {
		if (notification?.input) {
			// Set default input value
			setInputValue(notification.inputValue || '')
			// Focus the input field when it appears
			setTimeout(() => inputRef.current?.focus(), 100)
		}
	}, [notification])

	if (!notification) return null

	// Confirm the notification
	const handleConfirm = () => {
		const currentId = notification.id
		if (notification.onConfirm) {
			notification.onConfirm({
				isConfirmed: true,
				value: inputValue,
				isDismissed: false,
			})
		}

		// Hide if no new notification was shown
		if (useGameStore.getState().notification?.id === currentId) {
			hideNotification()
		}
	}

	// Cancel the notification
	const handleCancel = () => {
		if (notification.onCancel) {
			notification.onCancel({
				isConfirmed: false,
				isDismissed: true,
			})
		}
		hideNotification()
	}

	// Keyboard shortcuts
	const handleKeyDown = (e) => {
		if (e.key === 'Enter') {
			handleConfirm()
		} else if (e.key === 'Escape') {
			handleCancel()
		}
	}

	return (
		<div className='fixed inset-0 flex items-center justify-center bg-black/20 z-50' onClick={handleCancel}>
			<div className='animate-fade-scale-in bg-black/80 rounded-2xl space-y-6 p-8 max-w-md w-full' onClick={(e) => e.stopPropagation()}>
				<div className={`flex items-center gap-4 ${notification.centered ? 'flex-col justify-center text-center gap-6' : ''}`}>
					{notification.type === 'success' && (
						<div className='bg-green-500/20 p-4 rounded-full animate-pop-in'>
							<CheckIcon className='w-12 h-12 text-green-500' />
						</div>
					)}
					{notification.icon && notification.type !== 'success' && (
						<notification.icon className={`text-white/90 ${notification.centered ? 'w-12 h-12 animate-pop-in' : 'w-6 h-6'}`} />
					)}
					{notification.title && <h2 className='text-2xl text-white font-bold'>{notification.title}</h2>}
				</div>

				{notification.text && <p className={`text-gray-300 ${notification.centered ? 'text-center text-lg' : ''}`}>{notification.text}</p>}

				{notification.html && <div dangerouslySetInnerHTML={{ __html: notification.html }} />}

				{notification.input && (
					<input
						ref={inputRef}
						type='text'
						className='w-full'
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={notification.inputPlaceholder || ''}
					/>
				)}

				{notification.actionButtons && notification.actionButtons.length > 0 && (
					<div className='grid grid-cols-2 gap-4 py-2 w-full'>
						{notification.actionButtons.map((actionButton, index) => (
							<button
								key={index}
								className='bg-transparent flex-col items-center justify-center gap-3 p-6 h-auto hover:bg-white/10 transition-all hover:scale-105 border border-white/5'
								onClick={() => {
									actionButton.action()
									hideNotification()
								}}>
								{actionButton.icon && <actionButton.icon className='w-8 h-8 text-white/80' />}
								<span className='font-medium text-white'>{actionButton.label}</span>
							</button>
						))}
					</div>
				)}

				<div className={`flex gap-4 ${notification.centered ? 'justify-center w-full' : 'justify-end'}`}>
					{notification.showCancelButton && (
						<button className='secondary' onClick={handleCancel}>
							{notification.cancelButtonText || 'Cancel'}
						</button>
					)}

					<button
						className={
							notification.type === 'success'
								? 'bg-green-600 hover:bg-green-500 w-full max-w-xs justify-center py-3 text-base shadow-lg shadow-green-900/20'
								: 'primary'
						}
						onClick={handleConfirm}>
						{notification.confirmButtonText || 'OK'}
					</button>
				</div>
			</div>
		</div>
	)
}

export default Notification
