import useGameStore from '../../store/gameStore'
import ControllerIcon from '../../assets/images/icons/Gamepad.svg'
import SaveIcon from '../../assets/images/icons/Save.svg'
import ShareIcon from '../../assets/images/icons/Share.svg'
import CameraIcon from '../../assets/images/icons/Camera.svg'
import InfoIcon from '../../assets/images/icons/Info.svg'

const Actions = () => {
	// Get vehicle state from store using selectors
	const currentVehicle = useGameStore((state) => state.currentVehicle)
	const savedVehicles = useGameStore((state) => state.savedVehicles)
	const setSavedVehicles = useGameStore((state) => state.setSavedVehicles)
	const showNotification = useGameStore((state) => state.showNotification)
	const controlsVisible = useGameStore((state) => state.controlsVisible)
	const setControlsVisible = useGameStore((state) => state.setControlsVisible)
	const infoMode = useGameStore((state) => state.infoMode)
	const setInfoMode = useGameStore((state) => state.setInfoMode)

	// Save current vehicle to local storage.
	const saveVehicle = () => {
		// Get the name of the existing vehicle, if available.
		const vehicleName = savedVehicles.current ? savedVehicles[savedVehicles.current]?.name : ''

		// Prompt the user for a name for their vehicle.
		showNotification({
			title: 'Save Your Vehicle',
			text: 'Enter a name for your vehicle:',
			icon: SaveIcon,
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

				// Show success dialog with share and screenshot options.
				showNotification({
					title: 'Saved!',
					text: `Your vehicle "${name}" has been saved.`,
					type: 'success',
					centered: true,
					confirmButtonText: 'Close',
					actionButtons: [
						{
							label: 'Share URL',
							icon: ShareIcon,
							action: () => {
								// Generate shareable URL
								const jsonString = JSON.stringify(currentVehicle)
								const encodedConfig = encodeURIComponent(jsonString)
								const shareableUrl = `${window.location.origin}?config=${encodedConfig}`

								// Copy to clipboard
								navigator.clipboard
									.writeText(shareableUrl)
									.then(() => {
										showNotification({
											title: 'Link Copied!',
											text: 'The shareable link has been copied to your clipboard.',
											type: 'success',
										})
									})
									.catch(() => {
										showNotification({
											title: 'Error',
											text: 'Failed to copy link to clipboard.',
											type: 'error',
										})
									})
							},
						},
						{
							label: 'Save Image',
							icon: CameraIcon,
							action: () => {
								// Trigger screenshot
								window.dispatchEvent(new Event('takeScreenshot'))
							},
						},
					],
				})
			},
		})
	}

	// Toggle controls visibility
	const toggleControls = () => {
		setControlsVisible(!controlsVisible)
	}

	// Toggle info mode
	const toggleInfoMode = () => {
		setInfoMode(!infoMode)
	}

	return (
		<div id='actions' className='flex gap-2 absolute bottom-4 right-4'>
			<button title={controlsVisible ? 'Hide Controls' : 'Show Controls'} className={controlsVisible ? 'active' : ''} onClick={toggleControls}>
				<ControllerIcon className='icon' />
			</button>
			<button title='Save Vehicle' className='secondary' onClick={saveVehicle}>
				<SaveIcon className='icon' />
			</button>
			<button title='Vehicle Info' className={`secondary ${infoMode ? 'active' : ''}`} onClick={toggleInfoMode}>
				<InfoIcon className='icon' />
			</button>
		</div>
	)
}

export default Actions
