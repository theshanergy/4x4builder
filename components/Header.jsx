import React, { useState, useEffect, useRef } from 'react'
import { ReactComponent as LogoIcon } from '../assets/images/icons/Logo.svg'
import { ReactComponent as GitHubIcon } from '../assets/images/icons/GitHub.svg'

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
                <LogoIcon className='icon' />
                <strong>4x4</strong>builder
            </h1>
            <div className='actions'>
                <a target='_blank' href='https://github.com/theshanergy/4x4builder' title='GitHub'>
                    <GitHubIcon className='icon' />
                </a>
            </div>
        </div>
    )
}

export default Header
