import { useEffect } from 'react'

import useGameStore from '../store/gameStore'

import Header from './ui/Header'
import Sidebar from './ui/Sidebar'
import Canvas from './scene/Canvas'
import Actions from './ui/Actions'
import Notification from './ui/Notification'

export default function App() {
    // Get vehicle state from game store
    const loadVehicleFromUrl = useGameStore((state) => state.loadVehicleFromUrl)

    // Run once to load vehicle from URL if present
    useEffect(() => {
        loadVehicleFromUrl()
    }, [loadVehicleFromUrl])

    return (
        <div className='App'>
            <Header />
            <Canvas />
            <Sidebar />
            <Actions />
            <Notification />
        </div>
    )
}
