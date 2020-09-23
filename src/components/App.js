import React, { useEffect, useReducer, useState } from 'react'
import swal from 'sweetalert'
import './App.css'

import vehicleConfigs from 'vehicleConfigs'
import Header from './Header'
import Editor from './Editor'
import Canvas from './Canvas'

function App(props) {
  // Run once.
  useEffect(() => {
    let session = window.location.pathname.replace(/^\/([^/]*).*$/, '$1')
    // Existing session.
    if (session) {
      // Get config from URL.
      props.database
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
  }, [props.database])

  // Current vehicle config.
  const [currentVehicle, setVehicle] = useReducer((currentVehicle, newState) => ({ ...currentVehicle, ...newState }), {id: null})

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
    // Set new session.
    let session = randomString(16)
    // Store current config to db.
    props.database.ref('/configs/' + session).set(currentVehicle)
    // push session string to url.
    window.history.pushState({}, 'Save', '/' + session)
    // Notify user.
    swal('New Vehicle Saved!', 'Please copy or bookmark this page URL.', 'success')
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
        <Canvas vehicle={currentVehicle} setVehicle={setVehicle} cameraAutoRotate={cameraAutoRotate} />
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
