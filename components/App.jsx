import { useEffect } from 'react'

import useGameStore from '../store/gameStore'

import Header from './Header'
import Sidebar from './Sidebar'
import Canvas from './Canvas'
import Actions from './Actions'
import Notification from './Notification'

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
