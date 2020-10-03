import React, { useEffect, useReducer, useState } from 'react'
import swal from 'sweetalert'
import './App.css'

import vehicleConfigs from 'vehicleConfigs'
import Header from './Header'
import Editor from './Editor'
import Canvas from './Canvas'

function App({ database, analytics }) {
  // Current vehicle config.
  const [currentVehicle, setVehicle] = useReducer((currentVehicle, newState) => ({ ...currentVehicle, ...newState }), { id: null, addons: {} })

  // Camera rotation.
  const [cameraAutoRotate, setCameraAutoRotate] = useState(true)

  // Run once.
  useEffect(() => {
    // Get session from url.
    let session = window.location.pathname.replace(/^\/([^/]*).*$/, '$1')
    // Existing session.
    if (session) {
      // Get config from URL.
      database()
        .ref('/configs/' + session)
        .once('value')
        .then(function (data) {
          let value = data.val()
          // If vehicle exists.
          if (value != null) {
            // Overwrite current vehicle from response.
            setVehicle(value)
          } else {
            console.log('No saved vehicle at this URL')
          }
        })
    } else {
      setVehicle(vehicleConfigs.defaults)
    }
  }, [database])

  // Save current config.
  const saveVehicle = () => {
    // Generate new object key / url.
    let newVehicleConfig = database().ref().child('configs').push()
    // Store current config to db.
    newVehicleConfig.set(currentVehicle).then(() => {
      // Push newly created object id to url.
      window.history.pushState({}, 'Save', '/' + newVehicleConfig.key)
      // Track pageview.
      analytics.pageview(window.location.pathname)
      // Notify user.
      swal('New Vehicle Saved!', 'Please copy or bookmark this page URL.', 'success')
    })
  }

  // Request new part.
  const requestForm = () => {
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
        database().ref('/requests').push(value)
        // Notify user.
        swal('Awesome!', "Thanks for the suggestion! We'll add it to the list.", 'success')
      }
    })
  }

  return (
    <div className="App">
      <Header requestForm={requestForm} />
      <Canvas vehicle={currentVehicle} setVehicle={setVehicle} saveVehicle={saveVehicle} cameraAutoRotate={cameraAutoRotate} />
      <Editor isActive={true} currentVehicle={currentVehicle} setVehicle={setVehicle} cameraAutoRotate={cameraAutoRotate} setCameraAutoRotate={setCameraAutoRotate} />
    </div>
  )
}

export default App
