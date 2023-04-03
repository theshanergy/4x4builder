import { useCallback } from 'react'
import Swal from 'sweetalert2'

const Actions = ({ currentVehicle, savedVehicles, setSavedVehicles }) => {
    // Save current vehicle to local storage.
    const saveVehicle = () => {
        // Get the name of the existing vehicle, if available.
        const vehicleName = savedVehicles.current ? savedVehicles[savedVehicles.current]?.name : ''

        // Prompt the user for a name for their vehicle.
        Swal.fire({
            title: 'Save Your Vehicle',
            text: 'Enter a name for your vehicle:',
            input: 'text',
            inputValue: vehicleName,
            showCancelButton: true,
            confirmButtonText: 'Submit',
            cancelButtonText: 'Cancel',
        }).then((result) => {
            if (result.isDismissed) {
                return
            }

            // Get submitted vehicle name.
            const name = result.value

            // No name provided.
            if (!name) {
                Swal.fire('Error', 'Please enter a name for your vehicle.', 'error')
                return
            }

            // Check if we are updating an existing vehicle or saving a new one.
            // If the name has been changed, save as a new vehicle.
            const vehicleId = savedVehicles.current && name === vehicleName ? savedVehicles.current : Date.now()

            // Create an object to represent the vehicle.
            const vehicle = {
                name: name,
                config: currentVehicle,
            }

            // Save the vehicle to local storage and set current.
            const newSavedVehicles = {
                ...savedVehicles,
                current: vehicleId,
                [vehicleId]: vehicle,
            }
            setSavedVehicles(newSavedVehicles)

            // Notify the user that the vehicle has been saved.
            Swal.fire('Saved!', 'Your vehicle has been saved.', 'success')
        })
    }

    // Share current config.
    const shareVehicle = useCallback(() => {
        // Generate shareable URL.
        const jsonString = JSON.stringify(currentVehicle)
        const encodedConfig = encodeURIComponent(jsonString)
        const shareableUrl = `${window.location.origin}?config=${encodedConfig}`
        // Notify user with the link element and copy button.
        Swal.fire({
            title: 'Share Your Vehicle',
            text: 'Copy this link to save or share your vehicle configuration:',
            html: `<a href="${shareableUrl}">Shareable link</a>`,
            showCancelButton: true,
            confirmButtonText: 'Copy Link',
            cancelButtonText: 'Cancel',
        }).then((result) => {
            if (result.isConfirmed) {
                // Copy the shareable URL to the clipboard.
                navigator.clipboard
                    .writeText(shareableUrl)
                    .then(() => {
                        // Notify the user that the link has been copied.
                        Swal.fire('Copied!', 'The shareable link has been copied to your clipboard.', 'success')
                    })
                    .catch((error) => {
                        // Handle error.
                        Swal.fire('Error', 'An error occurred while copying the link to the clipboard.', 'error')
                    })
            }
        })
    }, [currentVehicle])

    // Trigger screenshot.
    const takeScreenshot = () => {
        window.dispatchEvent(new Event('takeScreenshot'))
    }

    return (
        <div id='actions'>
            <button onClick={saveVehicle}>Save</button>
            <button onClick={shareVehicle}>Share</button>
            <button onClick={takeScreenshot}>Screenshot</button>
        </div>
    )
}

export default Actions
