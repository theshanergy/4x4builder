import { useEffect } from 'react'

import useGameStore from '../store/gameStore'
import VehicleTitle from './VehicleTitle'
import Header from './Header'
import Editor from './Editor'
import Canvas from './Canvas'
import Actions from './Actions'

export default function App() {
    // Get vehicle state from game store
    const loadVehicleFromUrl = useGameStore((state) => state.loadVehicleFromUrl)

    // Run once to load vehicle from URL if present
    useEffect(() => {
        loadVehicleFromUrl()
    }, [loadVehicleFromUrl])

    return (
        <div className='App'>
            <Header>
                <VehicleTitle />
            </Header>
            <Canvas />
            <Editor isActive={true} />
            <Actions />
        </div>
    )
}
