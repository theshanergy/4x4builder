import { memo, useCallback } from 'react'
import swal from 'sweetalert'

const RequestForm = memo(({ callback }) => {
    // Request new part.
    const requestForm = useCallback(() => {
        // Popup.
        swal({
            title: 'Vehicle Request',
            text: "Would you like your vehicle added or is there an addon we're missing? Let us know!",
            buttons: ['Cancel', 'Submit'],
            content: {
                element: 'input',
                attributes: {
                    placeholder: 'Enter vehicle or part name here.',
                },
            },
        }).then((value) => {
            if (value === '') {
                swal('Error', 'You need to write something!', 'error')
                return false
            } else if (value) {
                // Submit request using Netlify forms.
                fetch('/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ request: value }).toString(),
                })
                    .then(() => {
                        // Notify user.
                        swal('Awesome!', "Thanks for the suggestion! We'll add it to the list.", 'success')
                    })
                    .catch((error) => {
                        // Handle error.
                        swal('Error', 'An error occurred while submitting the request.', 'error')
                    })
            }
        })
    }, [])

    // Handle click.
    const handleClick = () => {
        requestForm()
        callback()
    }

    return (
        <>
            <a onClick={handleClick}>Vehicle request</a>
            <form name='vehicleRequestForm' method='POST' data-netlify='true' data-netlify-honeypot='bot-field' style={{ display: 'none' }}>
                <input type='hidden' name='form-name' value='vehicleRequestForm' />
                <input type='text' name='request' />
                <input name='bot-field' />
            </form>
        </>
    )
})

export default RequestForm
