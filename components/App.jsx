import { useEffect } from 'react'

import useGameStore from '../store/gameStore'

import Header from './ui/Header'
import Sidebar from './ui/Sidebar'
import Canvas from './scene/Canvas'
import Actions from './ui/Actions'
import Speedometer from './ui/Speedometer'
import Notification from './ui/Notification'
import ControlsOverlay from './ui/ControlsOverlay'
import Chat from './ui/Chat'

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
            <Speedometer />
            <Actions />
            <ControlsOverlay />
            <Notification />
            <Chat />
        </div>
    )
}
