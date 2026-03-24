import { useState } from 'react'

const encode = (data) =>
	Object.keys(data)
		.map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
		.join('&')

// Feedback form rendered inside the Notification modal
const FeedbackForm = ({ onSuccess, placeholder = 'Share your thoughts, bug reports, or feature requests…' }) => {
	const [email, setEmail] = useState('')
	const [message, setMessage] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState(null)

	const handleSubmit = async (e) => {
		e.preventDefault()
		setSubmitting(true)
		setError(null)

		try {
			const response = await fetch('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: encode({ 'form-name': 'feedback', email, message }),
			})

			if (!response.ok) throw new Error('Submission failed')
			onSuccess()
		} catch {
			setError('Something went wrong. Please try again.')
			setSubmitting(false)
		}
	}

	return (
		<form onSubmit={handleSubmit} className='space-y-4'>
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
					required
					rows={4}
					className='w-full'
				/>
			</div>
			{error && <p className='text-red-400 text-sm'>{error}</p>}
			<button type='submit' disabled={submitting} className='w-full justify-center'>
				{submitting ? 'Sending…' : 'Send Feedback'}
			</button>
		</form>
	)
}

export default FeedbackForm
