import React, { useState, useEffect, useRef } from 'react'
import LogoIcon from './icons/Logo'
import RequestForm from './RequestForm'

function Header() {
    // Editor visibility.
    const [menuActive, setMenuActive] = useState(false)

    // Ref to the menu element.
    const menuRef = useRef(null)

    // Toggle menu.
    function toggleMenu() {
        setMenuActive(!menuActive)
    }

    // Close menu if clicked outside.
    function handleClickOutside(event) {
        // Check if the click happened outside the menu and not on the toggle button.
        if (menuRef.current && !menuRef.current.contains(event.target) && event.target.id !== 'menu-toggle') {
            setMenuActive(false)
        }
    }

    // Add event listener on mount, remove on unmount.
    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [])

    return (
        <div id='header'>
            <h1>
                <LogoIcon />
                <strong>4x4</strong>builder
            </h1>
            <button id='menu-toggle' onClick={toggleMenu}>
                <span>Toggle menu</span>
            </button>
            <div id='navigation' className={menuActive ? 'active' : ''} ref={menuRef}>
                <ul className='menu'>
                    <li>
                        <RequestForm callback={toggleMenu} />
                    </li>
                </ul>
            </div>
        </div>
    )
}

export default Header
