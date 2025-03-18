import { useEffect, useState, useRef } from 'react'
import useGameStore from '../store/gameStore'

// Notification component
const Notification = () => {
    const notification = useGameStore((state) => state.notification)
    const hideNotification = useGameStore((state) => state.hideNotification)

    const [inputValue, setInputValue] = useState('')
    const inputRef = useRef(null)

    // Reset input value when notification changes
    useEffect(() => {
        if (notification?.input) {
            setInputValue(notification.inputValue || '')
            // Focus the input field when it appears
            setTimeout(() => {
                inputRef.current?.focus()
            }, 100)
        }
    }, [notification])

    if (!notification) return null

    const handleConfirm = () => {
        if (notification.onConfirm) {
            notification.onConfirm({
                isConfirmed: true,
                value: inputValue,
                isDismissed: false,
            })
        }
        hideNotification()
    }

    const handleCancel = () => {
        if (notification.onCancel) {
            notification.onCancel({
                isConfirmed: false,
                isDismissed: true,
            })
        }
        hideNotification()
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleConfirm()
        } else if (e.key === 'Escape') {
            handleCancel()
        }
    }

    // Prevent clicks on the overlay from closing the notification
    const handleOverlayClick = (e) => {
        e.stopPropagation()
    }

    return (
        <div className='fixed inset-0 flex items-center justify-center bg-black/20 z-50' onClick={handleCancel}>
            <div className='bg-black/80 text-gray-400 rounded-xl space-y-4 p-8 max-w-md w-full shadow-xl' onClick={handleOverlayClick}>
                {notification.title && <h2 className='text-xl text-white/90 font-bold'>{notification.title}</h2>}

                {notification.text && <p>{notification.text}</p>}

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

                <div className='flex justify-end gap-4'>
                    {notification.showCancelButton && (
                        <button className='secondary' onClick={handleCancel}>
                            {notification.cancelButtonText || 'Cancel'}
                        </button>
                    )}

                    <button onClick={handleConfirm}>{notification.confirmButtonText || 'OK'}</button>
                </div>
            </div>
        </div>
    )
}

export default Notification
