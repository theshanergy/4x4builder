import React, { useState } from 'react'
import LogoIcon from './icons/Logo'

function Header({ requestForm }) {
  // Editor visibility.
  const [menuActive, setMenuActive] = useState(false)

  // Toggle menu.
  function toggleMenu() {
    setMenuActive(!menuActive)
  }

  return (
    <div id="header">
      <h1>
        <LogoIcon />
        <strong>4x4</strong>builder
      </h1>
      <button id="menu-toggle" onClick={toggleMenu}>
        <span>Toggle menu</span>
      </button>
      <div id="navigation" className={menuActive ? 'active' : ''}>
        <ul className="menu">
          <li
            onClick={() => {
              requestForm()
              setMenuActive(false)
            }}
          >
            Vehicle request
          </li>
        </ul>
      </div>
    </div>
  )
}

export default Header
