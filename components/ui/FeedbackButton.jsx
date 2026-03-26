import { useRef } from 'react'
import useGameStore from '../../store/gameStore'
import FeedbackForm from './FeedbackForm'
import ChatIcon from '../../assets/images/icons/Chat.svg'

const FeedbackButton = () => {
	const showNotification = useGameStore((state) => state.showNotification)
	const formRef = useRef()

	const handleSuccess = () => {
		showNotification({
			type: 'success',
			title: 'Thanks!',
			text: 'Your feedback has been received. We appreciate you taking the time.',
			centered: true,
			confirmButtonText: 'Close',
		})
	}

	const handleClick = () => {
		showNotification({
			title: 'Feedback',
			content: <FeedbackForm ref={formRef} onSuccess={handleSuccess} />,
			showCancelButton: true,
			cancelButtonText: 'Close',
			confirmButtonText: 'Send Feedback',
			onConfirm: () => formRef.current.submit(),
		})
	}

	return (
		<button
			onClick={handleClick}
			className='mt-auto flex gap-4 items-center w-full px-5 py-4 bg-stone-900/60 text-stone-500 uppercase text-sm font-bold hover:bg-stone-800/60 transition-colors'>
			<ChatIcon className='w-5 h-5' />
			Feedback
		</button>
	)
}

export default FeedbackButton
