import { useRef, useState, useEffect } from 'react'
import classNames from 'classnames'

import useGameStore from '../store/gameStore'
import ChevronIcon from '../assets/images/icons/Chevron.svg'
import TrashIcon from '../assets/images/icons/Trash.svg'

// Vehicle switcher component
const VehicleSwitcher = () => {
    const setVehicle = useGameStore((state) => state.setVehicle)
    const savedVehicles = useGameStore((state) => state.savedVehicles)
    const setSavedVehicles = useGameStore((state) => state.setSavedVehicles)
    const deleteSavedVehicle = useGameStore((state) => state.deleteSavedVehicle)

    const dropdownRef = useRef(null)
    const [showDropdown, setShowDropdown] = useState(false)

    const handleVehicleSelect = (vehicleId) => {
        setSavedVehicles((prev) => ({ ...prev, current: vehicleId }))
        setVehicle(savedVehicles[vehicleId]?.config)
        setShowDropdown(false)
    }

    const handleVehicleDelete = (event, vehicleId) => {
        event.stopPropagation()
        deleteSavedVehicle(vehicleId)
        setShowDropdown(false)
    }

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const savedVehicleList = Object.entries(savedVehicles).filter(([id]) => id !== 'current')
    const currentVehicleId = savedVehicles.current || null
    const currentVehicleTitle = currentVehicleId ? savedVehicles[currentVehicleId]?.name : 'Vehicles'

    return (
        <>
            {savedVehicleList.length > 0 ? (
                <div ref={dropdownRef} className='relative flex items-center h-full text-sm font-medium'>
                    <div className='flex gap-2 items-center px-5 py-2 rounded-full bg-black/80 text-white cursor-pointer' onClick={() => setShowDropdown(!showDropdown)}>
                        {currentVehicleTitle}
                        {savedVehicleList.length > 1 ? (
                            <ChevronIcon className='w-4 h-4' />
                        ) : (
                            <TrashIcon
                                className='p-1 ml-2 -mr-2 w-6 h-6 text-white/50 bg-white/10 hover:text-white/90 rounded-full'
                                onClick={(e) => handleVehicleDelete(e, currentVehicleId)}
                            />
                        )}
                    </div>
                    {showDropdown && savedVehicleList.length > 1 && (
                        <ul className='absolute top-full left-1/2 -translate-x-1/2 min-w-36 bg-black/80 text-white/80 z-10 rounded-lg overflow-hidden'>
                            {savedVehicleList.map(([vehicleId, vehicle]) => (
                                <li
                                    key={vehicleId}
                                    className={classNames(
                                        'flex items-center justify-between gap-4 py-4 px-6 whitespace-nowrap',
                                        vehicleId == currentVehicleId ? 'bg-blue-500 text-white cursor-default' : 'hover:bg-white/5 hover:text-blue-300 cursor-pointer'
                                    )}
                                    onClick={() => handleVehicleSelect(vehicleId)}>
                                    {vehicle.name}
                                    <TrashIcon
                                        className='p-1 w-7 h-7 ml-2 -mr-2 text-stone-600 bg-white/5 hover:bg-white/10 hover:text-white cursor-pointer rounded-full'
                                        onClick={(e) => handleVehicleDelete(e, vehicleId)}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}
        </>
    )
}

export default VehicleSwitcher
