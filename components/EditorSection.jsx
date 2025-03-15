import React, { useState } from 'react'
import classNames from 'classnames'

const EditorSection = ({ title, icon, children, defaultActive }) => {
    const [isActive, setActiveState] = useState(defaultActive)

    function toggleActive() {
        setActiveState(!isActive)
    }

    return (
        <div className={classNames('section', { active: isActive })}>
            <div className='flex gap-4 items-center p-4 bg-stone-900/60 uppercase text-sm font-bold cursor-pointer' onClick={toggleActive}>
                {icon}
                {title}
                <svg aria-hidden='true' viewBox='0 0 24 24' className={classNames('ml-auto w-5 fill-stone-600 h-auto', { 'transform rotate-270': !isActive })}>
                    <path d='M16.6 8.6L12 13.2 7.4 8.6 6 10l6 6 6-6z' />
                </svg>
            </div>
            <div className={classNames('p-4 flex flex-col gap-4 text-sm', { hidden: !isActive })}>{children}</div>
        </div>
    )
}

export default EditorSection
