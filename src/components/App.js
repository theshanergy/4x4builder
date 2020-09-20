import React, { useEffect, useReducer, useState } from 'react'
import swal from 'sweetalert'
import './App.css'

import vehicleConfigs from 'vehicleConfigs'
import EditorSection from './EditorSection'
import VehicleCanvas from './VehicleCanvas'

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
  function editorSave() {
    // Store current config to db.
    props.database.ref('/configs/' + session).set(currentVehicle)
    // push session string to url.
    window.history.pushState({}, 'Save', '/' + session)
    // Notify user.
    swal('Vehicle saved!', 'Please copy or bookmark this page. Anyone with this URL may edit the vehicle.', 'success')
  }

  // Request new part.
  function editorRequest() {
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

  // Only show addons section if options exist.
  function addonsExist() {
    return Object.keys(vehicleConfigs.vehicles[currentVehicle.id].addons).length > 0 ? true : false
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
      <div id="header">
        <h1>
          <span className="icon icon-truck"></span>
          <strong>4x4</strong>builder
        </h1>
        <button id="editor-toggle" className="icon icon-hamburger" onClick={toggleEditor}>
          <span>Editor</span>
        </button>
      </div>

      <div id="container">
        <div id="editor" className={editorVisible ? 'visible' : ''}>
          <div className="editor-container">
            {/* Vehicle */}
            <EditorSection title="Vehicle" defaultActive={true}>
              {/* Vehicle */}
              <div className="field field-vehicle">
                <label>Vehicle</label>
                <span className="select-wrapper">
                  <select value={currentVehicle.id} onChange={(e) => setVehicle({ id: e.target.value })}>
                    {Object.keys(vehicleConfigs.vehicles).map((id) => (
                      <option key={id} value={id}>
                        {vehicleConfigs.vehicles[id].name}
                      </option>
                    ))}
                  </select>
                </span>
              </div>

              {/* Vehicle Color */}
              <div className="field field-vehicle-color">
                <label>Paint</label>
                <input type="color" value={currentVehicle.color} onChange={(e) => setVehicle({ color: e.target.value })} />
              </div>

              {/* Vehicle reflectivity */}
              <div className="field field-vehicle-reflectivity">
                <span className="select-wrapper">
                  <select value={currentVehicle.reflectivity} onChange={(e) => setVehicle({ reflectivity: e.target.value })}>
                    <option value="0.2">Matte</option>
                    <option value="0.5">Semi Gloss</option>
                    <option value="0.8">High Gloss</option>
                  </select>
                </span>
              </div>

              {/* Vehicle Lift */}
              <div className="field field-vehicle-lift">
                <label>Lift</label>
                <span className="select-wrapper">
                  <select value={currentVehicle.lift} onChange={(e) => setVehicle({ lift: e.target.value })}>
                    <option value="0">0"</option>
                    <option value="1">1"</option>
                    <option value="2">2"</option>
                    <option value="3">3"</option>
                    <option value="4">4"</option>
                    <option value="5">5"</option>
                    <option value="6">6"</option>
                    <option value="7">7"</option>
                    <option value="8">8"</option>
                  </select>
                </span>
              </div>
            </EditorSection>

            {/* Wheels */}
            <EditorSection title="Wheels">
              {/* Rim */}
              <div className="field field-rim">
                <label>Rims</label>
                <span className="select-wrapper">
                  <select value={currentVehicle.rim} onChange={(e) => setVehicle({ rim: e.target.value })}>
                    {Object.keys(vehicleConfigs.wheels.rims).map((id) => (
                      <option key={id} value={id}>
                        {vehicleConfigs.wheels.rims[id].name}
                      </option>
                    ))}
                  </select>
                </span>
              </div>

              {/* Rim Color */}
              <div className="field field-rim-color">
                <label>Rim Color</label>
                <span className="select-wrapper">
                  <select value={currentVehicle.rim_color} onChange={(e) => setVehicle({ rim_color: e.target.value })}>
                    <option value="black">Black</option>
                    <option value="silver">Silver</option>
                    <option value="chrome">Chrome</option>
                  </select>
                </span>
              </div>

              {/* Rim Size */}
              <div className="field field-rim-size">
                <label>Rim Size</label>
                <span className="select-wrapper">
                  <select value={currentVehicle.rim_diameter} onChange={(e) => setVehicle({ rim_diameter: e.target.value })}>
                    <option value="14">14"</option>
                    <option value="15">15"</option>
                    <option value="16">16"</option>
                    <option value="17">17"</option>
                    <option value="18">18"</option>
                    <option value="19">19"</option>
                    <option value="20">20"</option>
                    <option value="21">21"</option>
                    <option value="22">22"</option>
                    <option value="23">23"</option>
                    <option value="24">24"</option>
                  </select>
                </span>
              </div>

              {/* Rim Width */}
              <div className="field field-rim-width">
                <label>Rim Width</label>
                <span className="select-wrapper">
                  <select value={currentVehicle.rim_width} onChange={(e) => setVehicle({ rim_width: e.target.value })}>
                    <option value="8">8"</option>
                    <option value="9">9"</option>
                    <option value="10">10"</option>
                    <option value="11">11"</option>
                    <option value="12">12"</option>
                    <option value="13">13"</option>
                    <option value="14">14"</option>
                    <option value="15">15"</option>
                    <option value="16">16"</option>
                  </select>
                </span>
              </div>

              {/* Tire */}
              <div className="field field-tire">
                <label>Tires</label>
                <span className="select-wrapper">
                  <select value={currentVehicle.tire} onChange={(e) => setVehicle({ tire: e.target.value })}>
                    {Object.keys(vehicleConfigs.wheels.tires).map((id) => (
                      <option key={id} value={id}>
                        {vehicleConfigs.wheels.tires[id].name}
                      </option>
                    ))}
                  </select>
                </span>
              </div>

              {/* Tire Size */}
              <div className="field field-tire-size">
                <label>Tire Size</label>
                <span className="select-wrapper">
                  <select value={currentVehicle.tire_diameter} onChange={(e) => setVehicle({ tire_diameter: e.target.value })}>
                    <option value="30">30"</option>
                    <option value="31">31"</option>
                    <option value="32">32"</option>
                    <option value="33">33"</option>
                    <option value="34">34"</option>
                    <option value="35">35"</option>
                    <option value="36">36"</option>
                    <option value="37">37"</option>
                    <option value="38">38"</option>
                    <option value="39">39"</option>
                    <option value="40">40"</option>
                  </select>
                </span>
              </div>
            </EditorSection>

            {/* Addons */}
            {addonsExist() && (
              <EditorSection title="Addons">
                {Object.keys(vehicleConfigs.vehicles[currentVehicle.id].addons).map((addon) => (
                  <div key={addon} className={`field field-${addon}`}>
                    <label>{vehicleConfigs.vehicles[currentVehicle.id].addons[addon].name}</label>
                    <span className="select-wrapper">
                      <select required onChange={(e) => setVehicle({ addons: { ...currentVehicle.addons, [addon]: e.target.value } })}>
                        {!vehicleConfigs.vehicles[currentVehicle.id].addons[addon].required && <option value="">None</option>}
                        {Object.keys(vehicleConfigs.vehicles[currentVehicle.id].addons[addon].options).map((option) => (
                          <option key={option} value={option}>
                            {vehicleConfigs.vehicles[currentVehicle.id].addons[addon].options[option].name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                ))}
              </EditorSection>
            )}

            {/* Scene */}
            <EditorSection title="Options">
              {/* Auto Rotate */}
              <div className="field field-camera-autorotate">
                <input type="checkbox" id="camera-autorotate" checked={cameraAutoRotate} onChange={(e) => setCameraAutoRotate(e.target.checked)} />
                <label htmlFor="camera-autorotate">Auto Rotate</label>
              </div>

              <div className="field field-editor-request">
                <button onClick={editorRequest}>Request New Part or Vehicle</button>
              </div>
            </EditorSection>
          </div>
        </div>

        <VehicleCanvas vehicle={currentVehicle} cameraAutoRotate={cameraAutoRotate} />
      </div>

      <div id="actions">
        <button id="save-button" onClick={editorSave}>
          Save
        </button>
      </div>
    </div>
  )
}

export default App
