import React, { useState } from 'react'

const EditorSection = (props) => {
  const [isActive, setActiveState] = useState(props.defaultActive)

  function toggleActive() {
    setActiveState(!isActive)
  }

  return (
    <div className={'section' + (isActive ? ' active' : '')}>
      <div className="section-header" onClick={toggleActive}>
        {props.icon}
        {props.title}
        <svg aria-hidden="true" className="arrow" viewBox="0 0 24 24" style={{transform: isActive ? 'rotate(180deg)' : 'none'}}>
          <path d="M16.6 8.6L12 13.2 7.4 8.6 6 10l6 6 6-6z" />
        </svg>
      </div>
      <div className="section-content">{props.children}</div>
    </div>
  )
}

export default EditorSection
