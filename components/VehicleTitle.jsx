import React, { useRef, useState, useEffect } from 'react'

const VehicleTitle = ({ savedVehicles, setSavedVehicles, setVehicle }) => {
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

        // Add event listener.
        document.addEventListener('mousedown', handleClickOutside)

        // Clean up.
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <>
            {savedVehicleCount.length > 1 ? (
                // Show vehicle selector when saved vehicle count is greater than 1.
                <div className='dropdown' ref={dropdownRef}>
                    <strong onClick={() => setShowDropdown(!showDropdown)}>
                        {title}
                        <svg aria-hidden='true' className='icon' viewBox='0 0 24 24'>
                            <path d='M16.6 8.6L12 13.2 7.4 8.6 6 10l6 6 6-6z' />
                        </svg>
                    </strong>
                    {showDropdown && (
                        <ul>
                            {Object.entries(savedVehicles).map(([vehicleId, vehicle]) => {
                                if (vehicleId === 'current') return null
                                return (
                                    <li key={vehicleId} onClick={() => handleVehicleSelect(vehicleId)}>
                                        {vehicle.name}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            ) : savedVehicleCount.length === 1 ? (
                // If only one vehicle, show title
                <div>
                    <strong>{title}</strong>
                </div>
            ) : null}
        </>
    )
}

export default VehicleTitle
