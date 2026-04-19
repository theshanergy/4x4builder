import { useState, forwardRef, useImperativeHandle } from 'react'

const encode = (data) =>
	Object.keys(data)
		.map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
		.join('&')

// Feedback form rendered inside the Notification modal.
// Exposes a submit() method via ref so the Notification's confirm button can trigger submission.
const FeedbackForm = forwardRef(({ onSuccess, placeholder = 'Share your thoughts, bug reports, or feature requests…' }, ref) => {
	const [email, setEmail] = useState('')
	const [message, setMessage] = useState('')
	const [error, setError] = useState(null)

	useImperativeHandle(ref, () => ({
		submit: async () => {
			setError(null)
			if (!message.trim()) {
				setError('Please enter a message.')
				throw new Error('Empty message')
			}
			const response = await fetch('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: encode({ 'form-name': 'feedback', 'bot-field': '', email, message }),
			})
			if (!response.ok) {
				setError('Something went wrong. Please try again.')
				throw new Error('Submission failed')
			}
			onSuccess()
		},
	}), [email, message, onSuccess])

	return (
		<form className='space-y-4'>
			<div>
				<label htmlFor='feedback-email'>Email <span className='text-gray-500 font-normal'>(optional)</span></label>
				<input
					id='feedback-email'
					type='email'
					name='email'
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder='your@email.com'
					className='w-full'
				/>
			</div>
			<div>
				<label htmlFor='feedback-message'>Message</label>
				<textarea
					id='feedback-message'
					name='message'
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					placeholder={placeholder}
					rows={4}
					className='w-full'
				/>
			</div>
			{error && <p className='text-red-400 text-sm'>{error}</p>}
		</form>
	)
})

FeedbackForm.displayName = 'FeedbackForm'

export default FeedbackForm
