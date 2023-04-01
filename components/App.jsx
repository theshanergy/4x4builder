import React, { useEffect, useReducer, useState, useCallback } from 'react'
import { ref, onValue, push, set } from 'firebase/database'
import swal from 'sweetalert'

import '../assets/styles/global.css'

import vehicleConfigs from '../vehicleConfigs'
import Header from './Header'
import Editor from './Editor'
import Canvas from './Canvas'

export default function App({ database }) {
    // Current vehicle config.
    const [currentVehicle, setVehicle] = useReducer((currentVehicle, newState) => ({ ...currentVehicle, ...newState }), vehicleConfigs.defaults)

    // Camera.
    const [cameraAutoRotate, setCameraAutoRotate] = useState(false)

    // Run once.
    useEffect(() => {
        // Get session from url.
        const sessionId = window.location.pathname.split('/')[1] || ''
        // Existing session.
        if (sessionId) {
            const configRef = ref(database, '/configs/' + sessionId)
            onValue(configRef, (snapshot) => {
                const configValue = snapshot.val()
                // If vehicle exists.
                if (configValue != null) {
                    // Overwrite current vehicle from response.
                    setVehicle(configValue)
                } else {
                    console.log('No saved vehicle at this URL')
                }
            })
        }
    }, [database])

    // Save current config.
    const saveVehicle = useCallback(() => {
        // Get configs ref.
        const configsRef = ref(database, 'configs')
        // Generate new object key / url.
        const newVehicleConfigRef = push(configsRef)
        // Store current config to db.
        set(newVehicleConfigRef, currentVehicle).then(() => {
            // Push newly created object id to url.
            window.history.pushState({}, 'Save', '/' + newVehicleConfigRef.key)
            // Notify user.
            swal('New Vehicle Saved!', 'Please copy or bookmark this page URL.', 'success')
        })
    }, [database, currentVehicle])

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
                // Save request.
                set(push(ref(database, 'requests')), value)

                // Notify user.
                swal('Awesome!', "Thanks for the suggestion! We'll add it to the list.", 'success')
            }
        })
    }, [database])

    return (
        <div className='App'>
            <Header requestForm={requestForm} />
            <Canvas currentVehicle={currentVehicle} setVehicle={setVehicle} saveVehicle={saveVehicle} cameraAutoRotate={cameraAutoRotate} />
            <Editor isActive={true} currentVehicle={currentVehicle} setVehicle={setVehicle} cameraAutoRotate={cameraAutoRotate} setCameraAutoRotate={setCameraAutoRotate} />
        </div>
    )
}
