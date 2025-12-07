import React, { useState } from 'react'
import classNames from 'classnames'
import ChevronIcon from '../../assets/images/icons/Chevron.svg'

const EditorSection = ({ title, icon, children, defaultActive, onExpand }) => {
	const [isActive, setActiveState] = useState(defaultActive)

	const toggleActive = () => {
		const newState = !isActive
		setActiveState(newState)
		if (newState && onExpand) {
			onExpand()
		}
	}

	return (
		<div className={classNames('section', { active: isActive })}>
			<div className='flex gap-4 items-center px-5 py-4 bg-stone-900/60 text-white/80 uppercase text-sm font-bold cursor-pointer' onClick={toggleActive}>
				{icon}
				{title}
				<ChevronIcon aria-hidden='true' className={classNames('icon ml-auto text-stone-600', { 'transform rotate-270': !isActive })} />
			</div>
			<div className={classNames('p-4 flex flex-col gap-4 text-md', { hidden: !isActive })}>{children}</div>
		</div>
	)
}

export default EditorSection
