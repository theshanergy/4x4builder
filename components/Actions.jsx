import { useCallback } from 'react'
import swal from 'sweetalert'

const Actions = ({ currentVehicle }) => {
    // Share current config.
    const shareVehicle = useCallback(() => {
        // Generate shareable URL.
        const jsonString = JSON.stringify(currentVehicle)
        const encodedConfig = encodeURIComponent(jsonString)
        const shareableUrl = `${window.location.origin}?config=${encodedConfig}`
        // Notify user with the link element and copy button.
        swal({
            title: 'Share Your Vehicle',
            text: 'Copy this link to save or share your vehicle configuration:',
            content: {
                element: 'a',
                attributes: {
                    href: shareableUrl,
                    textContent: 'Shareable link',
                },
            },
            buttons: {
                cancel: 'Cancel',
                copy: {
                    text: 'Copy Link',
                    value: 'copy',
                },
            },
        }).then((value) => {
            if (value === 'copy') {
                // Copy the shareable URL to the clipboard.
                navigator.clipboard
                    .writeText(shareableUrl)
                    .then(() => {
                        // Notify the user that the link has been copied.
                        swal('Copied!', 'The shareable link has been copied to your clipboard.', 'success')
                    })
                    .catch((error) => {
                        // Handle error.
                        swal('Error', 'An error occurred while copying the link to the clipboard.', 'error')
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
            <button onClick={shareVehicle}>Share</button>
            <button onClick={takeScreenshot}>Screenshot</button>
        </div>
    )
}

export default Actions
