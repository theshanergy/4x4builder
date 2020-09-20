import React, { useEffect, useReducer, useState } from 'react'
import swal from 'sweetalert'
import './App.css'

import vehicleConfigs from 'vehicleConfigs'
import Header from './Header'
import Editor from './Editor'
import Canvas from './Canvas'

function App(props) {
  // Get session.
  const [session, setSession] = useState(window.location.pathname.replace(/^\/([^/]*).*$/, '$1'))

  // Run once.
  useEffect(() => {
    // Existing session.
    if (session) {
      // Get default config from db.
      props.database
        .ref('/configs/' + session)
        .once('value')
        .then(function (data) {
          let value = data.val()
          // If exists.
          if (value != null) {
            // Overwrite current from response.
            setVehicle(value)
          } else {
            // Set new session.
            setSession(randomString(16))
          }
        })
    } else {
      // Set new session.
      setSession(randomString(16))
    }
  }, [])

  // Default vehicle config.
  const defaultVehicle = {
    id: vehicleConfigs.defaults.id,
    lift: vehicleConfigs.defaults.lift,
    color: vehicleConfigs.defaults.color,
    reflectivity: vehicleConfigs.defaults.reflectivity,
    addons: vehicleConfigs.defaults.addons,
    rim: vehicleConfigs.defaults.rim,
    rim_color: vehicleConfigs.defaults.rim_color,
    rim_diameter: vehicleConfigs.defaults.rim_diameter,
    rim_width: vehicleConfigs.defaults.rim_width,
    tire: vehicleConfigs.defaults.tire,
    tire_diameter: vehicleConfigs.defaults.tire_diameter,
  }

  // Current vehicle config.
  const [currentVehicle, setVehicle] = useReducer((currentVehicle, newState) => ({ ...currentVehicle, ...newState }), defaultVehicle)

  // Camera rotation.
  const [cameraAutoRotate, setCameraAutoRotate] = useState(true)

  // Editor visibility.
  const [editorVisible, setEditorVisible] = useState(true)

  // Toggle editor.
  function toggleEditor() {
    setEditorVisible(!editorVisible)
  }

  // Save current config.
  function saveVehicle() {
    // Store current config to db.
    props.database.ref('/configs/' + session).set(currentVehicle)
    // push session string to url.
    window.history.pushState({}, 'Save', '/' + session)
    // Notify user.
    swal('Vehicle saved!', 'Please copy or bookmark this page. Anyone with this URL may edit the vehicle.', 'success')
  }

  // Request new part.
  function requestForm() {
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
        props.database.ref('/requests').push(value)
        // Notify user.
        swal('Awesome!', "Thanks for the suggestion! We'll add it to the list.", 'success')
      }
    })
  }

  // Random string generator.
  function randomString(length) {
    let text = ''
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
  }

  return (
    <div className="App">
      <Header toggleEditor={toggleEditor} />

      <div id="container">
        <Editor visible={editorVisible} currentVehicle={currentVehicle} setVehicle={setVehicle} cameraAutoRotate={cameraAutoRotate} setCameraAutoRotate={setCameraAutoRotate} requestForm={requestForm} />
        <Canvas vehicle={currentVehicle} cameraAutoRotate={cameraAutoRotate} />
      </div>

      <div id="actions">
        <button id="save-button" onClick={saveVehicle}>
          Save
        </button>
      </div>
    </div>
  )
}

export default App
