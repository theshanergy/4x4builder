import { useRef, useState, useEffect } from 'react'
import classNames from 'classnames'
import useGameStore from '../store/gameStore'
import ChevronIcon from '../assets/images/icons/Chevron.svg'
import TrashIcon from '../assets/images/icons/Trash.svg'

const VehicleTitle = () => {
    // Get vehicle state from store using selectors
    const setVehicle = useGameStore((state) => state.setVehicle)
    const savedVehicles = useGameStore((state) => state.savedVehicles)
    const setSavedVehicles = useGameStore((state) => state.setSavedVehicles)
    const deleteSavedVehicle = useGameStore((state) => state.deleteSavedVehicle)

    const dropdownRef = useRef(null)
    const [showDropdown, setShowDropdown] = useState(false)

    // Handle vehicle select.
    const handleVehicleSelect = (vehicleId) => {
        // Set current saved vehicle.
        setSavedVehicles((prevSavedVehicles) => ({
            ...prevSavedVehicles,
            current: vehicleId,
        }))

        // Overwrite current vehicle config.
        setVehicle(savedVehicles[vehicleId].config)

        // Hide dropdown.
        setShowDropdown(false)
    }

    // Handle vehicle delete.
    const handleVehicleDelete = (event, vehicleId) => {
        event.stopPropagation() // Prevents triggering handleVehicleSelect

        // Use the store method to delete the vehicle
        deleteSavedVehicle(vehicleId)

        // Hide dropdown after deletion
        setShowDropdown(false)
    }

    // Check if we have saved vehicles.
    const savedVehicleCount = Object.keys(savedVehicles).filter((key) => key !== 'current')

    // Set title.
    const title = savedVehicles.current ? savedVehicles[savedVehicles.current]?.name : 'Vehicles'

    // Add event listener to detect clicks outside of the dropdown.
    useEffect(() => {
        // Handle click outside of the dropdown.
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false)
            }
        }

        // Event listener.
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <>
            {savedVehicleCount.length > 0 ? (
                // Show vehicle selector when saved vehicle count is greater than 1.
                <div className='flex items-center h-full relative cursor-pointer' ref={dropdownRef}>
                    <strong className={classNames('px-3 py-2 rounded-xl hover:bg-black/5', showDropdown ? 'bg-black/5' : '')} onClick={() => setShowDropdown(!showDropdown)}>
                        {title}
                        <ChevronIcon className='icon ml-1' />
                    </strong>
                    {showDropdown && (
                        <ul className='absolute top-full mt-2 left-1/2 -translate-x-1/2 flex flex-col min-w-36 p-0 bg-black/80 text-white/80 z-10 rounded text-sm'>
                            {Object.entries(savedVehicles).map(([vehicleId, vehicle]) => {
                                if (vehicleId === 'current') return null
                                return (
                                    <li
                                        key={vehicleId}
                                        onClick={() => handleVehicleSelect(vehicleId)}
                                        className='flex items-center justify-between gap-3 py-4 px-6 whitespace-nowrap hover:bg-black/10 hover:text-blue-300'>
                                        {vehicle.name}
                                        <TrashIcon
                                            className='block p-1 w-6 h-6 ml-2 text-stone-600 hover:bg-white/10 hover:text-white rounded-full'
                                            onClick={(event) => handleVehicleDelete(event, vehicleId)}
                                        />
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            ) : null}
        </>
    )
}

export default VehicleTitle
