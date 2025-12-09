import React, { useState, useRef, useEffect } from 'react'
import classNames from 'classnames'
import ChevronIcon from '../../assets/images/icons/Chevron.svg'

const EditorSection = ({ title, icon, badge, children, defaultActive, onExpand }) => {
	const [isActive, setActiveState] = useState(defaultActive)
	const sectionRef = useRef(null)

	const toggleActive = () => {
		const newState = !isActive
		setActiveState(newState)
		if (newState && onExpand) {
			onExpand()
		}
	}

	// Scroll the expanded content into view when section opens
	useEffect(() => {
		if (isActive && sectionRef.current) {
			// Small delay to let the content render
			requestAnimationFrame(() => {
				sectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
			})
		}
	}, [isActive])

	return (
		<div ref={sectionRef} className={classNames('section', { active: isActive })}>
			<div className='flex gap-4 items-center px-5 py-4 bg-stone-900/60 text-white/80 uppercase text-sm font-bold cursor-pointer' onClick={toggleActive}>
				<span className='relative'>
					{icon}
					{badge > 0 && (
						<span className='absolute -top-1.5 -right-2 bg-green-700 text-white text-[10px] font-bold min-w-4 h-4 flex items-center justify-center rounded-full px-1'>
							{badge}
						</span>
					)}
				</span>
				{title}
				<ChevronIcon aria-hidden='true' className={classNames('icon ml-auto text-stone-600', { 'transform rotate-270': !isActive })} />
			</div>
			<div className={classNames('p-4 flex flex-col gap-4 text-md', { hidden: !isActive })}>{children}</div>
		</div>
	)
}

export default EditorSection
