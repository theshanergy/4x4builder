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
		<div className='mt-auto'>
			<button onClick={handleClick} className='w-full mt-5 bg-white/2 border-solid border-white/5 text-white/60 hover:bg-white/5'>
				<ChatIcon className='w-5 h-5' />
				Feedback
			</button>
		</div>
	)
}

export default FeedbackButton
