import { useState, useEffect } from 'react'

import Drawer from './Drawer'
import Editor from './Editor'
import Logo from './Logo'

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
        <Drawer id='sidebar' isVertical={isVertical} defaultOpen={isVertical} className='order-first bg-black/80 text-gray-400 z-50'>
            <Logo />
            <Editor />
        </Drawer>
    )
}

export default Sidebar
