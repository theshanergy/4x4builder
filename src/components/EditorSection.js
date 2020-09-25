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
      </div>
      <div className="section-content">{props.children}</div>
    </div>
  )
}

export default EditorSection
