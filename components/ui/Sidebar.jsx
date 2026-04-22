import { useState, useEffect } from 'react'

import Drawer from './Drawer'
import Editor from './Editor'
import Logo from './Logo'
import MultiplayerPanel from './MultiplayerPanel'
import FeedbackButton from './FeedbackButton'

// Sidebar component
const Sidebar = () => {
	const [isVertical, setIsVertical] = useState(window.innerWidth / window.innerHeight >= 1)

	useEffect(() => {
		const handleResize = () => {
			setIsVertical(window.innerWidth / window.innerHeight >= 1)
		}

		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [])

	return (
		<Drawer id='sidebar' isVertical={isVertical} defaultOpen={isVertical} className='order-first p-5 bg-black/80 text-gray-400 backdrop-blur-md z-50'>
			<Logo />
			<Editor />
			<MultiplayerPanel />
			<FeedbackButton />
		</Drawer>
	)
}

export default Sidebar
