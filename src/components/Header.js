import React from 'react'

function Header(props) {
  return (
    <div id="header">
      <h1>
        <strong>4x4</strong>builder
      </h1>
      <button id="editor-toggle" className="icon icon-hamburger" onClick={props.toggleEditor}>
        <span>Toggle editor</span>
      </button>
    </div>
  )
}

export default Header
