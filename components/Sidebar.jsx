import { useState, useEffect } from 'react'

import Drawer from './Drawer'
import Editor from './Editor'

// Sidebar component
const Sidebar = () => {
    const [isVertical, setIsVertical] = useState(window.innerWidth >= 1024)

    useEffect(() => {
        const handleResize = () => setIsVertical(window.innerWidth >= 1024)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <Drawer id='sidebar' isVertical={isVertical} className={isVertical ? 'top-15' : ''}>
            <Editor />
        </Drawer>
    )
}

export default Sidebar
