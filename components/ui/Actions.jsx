import { useCallback } from 'react'
import useGameStore from '../../store/gameStore'
import ControllerIcon from '../../assets/images/icons/Gamepad.svg'
import SaveIcon from '../../assets/images/icons/Save.svg'
import ShareIcon from '../../assets/images/icons/Share.svg'
import CameraIcon from '../../assets/images/icons/Camera.svg'

const Actions = () => {
	// Get vehicle state from store using selectors
	const currentVehicle = useGameStore((state) => state.currentVehicle)
	const savedVehicles = useGameStore((state) => state.savedVehicles)
	const setSavedVehicles = useGameStore((state) => state.setSavedVehicles)
	const showNotification = useGameStore((state) => state.showNotification)
	const controlsVisible = useGameStore((state) => state.controlsVisible)
	const setControlsVisible = useGameStore((state) => state.setControlsVisible)

	// Save current vehicle to local storage.
	const saveVehicle = () => {
		// Get the name of the existing vehicle, if available.
		const vehicleName = savedVehicles.current ? savedVehicles[savedVehicles.current]?.name : ''

		// Prompt the user for a name for their vehicle.
		showNotification({
			title: 'Save Your Vehicle',
			text: 'Enter a name for your vehicle:',
			input: true,
			inputValue: vehicleName,
			showCancelButton: true,
			confirmButtonText: 'Submit',
			cancelButtonText: 'Cancel',
			onConfirm: (result) => {
				if (result.isDismissed) {
					return
				}

				// Get submitted vehicle name.
				const name = result.value

				// No name provided.
				if (!name) {
					showNotification({
						title: 'Error',
						text: 'Please enter a name for your vehicle.',
						type: 'error',
						onConfirm: () => {
							// Reopen the original save dialog
							saveVehicle()
						},
					})
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
				showNotification({
					title: 'Saved!',
					text: 'Your vehicle has been saved.',
					type: 'success',
				})
			},
		})
	}

	// Share current config.
	const shareVehicle = useCallback(() => {
		// Generate shareable URL.
		const jsonString = JSON.stringify(currentVehicle)
		const encodedConfig = encodeURIComponent(jsonString)
		const shareableUrl = `${window.location.origin}?config=${encodedConfig}`

		// Notify user with the link element and copy button.
		showNotification({
			title: 'Share Your Vehicle',
			text: 'Copy this link to save or share your vehicle configuration:',
			html: `<a href="${shareableUrl}">Shareable link</a>`,
			showCancelButton: true,
			confirmButtonText: 'Copy Link',
			cancelButtonText: 'Cancel',
			onConfirm: (result) => {
				if (result.isConfirmed) {
					// Copy the shareable URL to the clipboard.
					navigator.clipboard
						.writeText(shareableUrl)
						.then(() => {
							// Notify the user that the link has been copied.
							showNotification({
								title: 'Copied!',
								text: 'The shareable link has been copied to your clipboard.',
								type: 'success',
							})
						})
						.catch((error) => {
							// Handle error.
							showNotification({
								title: 'Error',
								text: 'An error occurred while copying the link to the clipboard.',
								type: 'error',
							})
						})
				}
			},
		})
	}, [currentVehicle, showNotification])

	// Trigger screenshot.
	const takeScreenshot = () => {
		window.dispatchEvent(new Event('takeScreenshot'))
	}

	// Toggle controls visibility
	const toggleControls = () => {
		setControlsVisible(!controlsVisible)
	}

	return (
		<div id='actions' className='flex gap-2 absolute bottom-4 right-4'>
			<button title={controlsVisible ? 'Hide Controls' : 'Show Controls'} className={controlsVisible ? 'active' : ''} onClick={toggleControls}>
				<ControllerIcon className='icon' />
			</button>
			<button title='Save Vehicle' className='secondary' onClick={saveVehicle}>
				<SaveIcon className='icon' />
			</button>
			<button title='Share Vehicle' className='secondary' onClick={shareVehicle}>
				<ShareIcon className='icon' />
			</button>
			<button title='Take Screenshot' className='secondary' onClick={takeScreenshot}>
				<CameraIcon className='icon' />
			</button>
		</div>
	)
}

export default Actions
