import React from 'react'

import vehicleConfigs from 'vehicleConfigs'
import EditorSection from './EditorSection'

import VehicleIcon from './icons/Vehicle'
import WheelIcon from './icons/Wheel'
import ToolIcon from './icons/Tool'
import GearIcon from './icons/Gear'

function Editor(props) {
  // Only show addons section if options exist.
  function addonsExist() {
    return (props.currentVehicle.id && Object.keys(vehicleConfigs.vehicles[props.currentVehicle.id].addons).length > 0) ? true : false
  }

  return (
    <div id="editor" className={props.visible ? 'visible' : ''}>
      <div className="editor-container">
        {/* Vehicle */}
        <EditorSection title="Vehicle" icon={<VehicleIcon />} defaultActive={true}>
          {/* Vehicle */}
          <div className="field field-vehicle">
            <label>Model</label>
            <select value={props.currentVehicle.id} onChange={(e) => props.setVehicle({ id: e.target.value })}>
              {Object.keys(vehicleConfigs.vehicles).map((id) => (
                <option key={id} value={id}>
                  {vehicleConfigs.vehicles[id].name}
                </option>
              ))}
            </select>
          </div>

          {/* Vehicle Color */}
          <div className="field field-vehicle-color">
            <label>Paint</label>
            <input type="color" value={props.currentVehicle.color} onChange={(e) => props.setVehicle({ color: e.target.value })} />
          </div>

          {/* Vehicle roughness */}
          <div className="field field-vehicle-roughness">
            <select value={props.currentVehicle.roughness} onChange={(e) => props.setVehicle({ roughness: e.target.value })}>
              <option value="1">Matte</option>
              <option value="0.5">Semi Gloss</option>
              <option value="0">High Gloss</option>
            </select>
          </div>

          {/* Vehicle Lift */}
          <div className="field field-vehicle-lift">
            <label>Lift</label>
            <select value={props.currentVehicle.lift} onChange={(e) => props.setVehicle({ lift: e.target.value })}>
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
          </div>
        </EditorSection>

        {/* Wheels */}
        <EditorSection title="Wheels" icon={<WheelIcon />}>
          {/* Wheel Offset */}
          <div className="field field-wheel-offset">
            <label>Wheel Offset</label>
            <input type="range" min="0" max="0.1" step="0.01" value={props.currentVehicle.wheel_offset} onChange={(e) => props.setVehicle({ wheel_offset: e.target.value })} />
          </div>

          {/* Rim */}
          <div className="field field-rim">
            <label>Rim Type</label>
            <select value={props.currentVehicle.rim} onChange={(e) => props.setVehicle({ rim: e.target.value })}>
              {Object.keys(vehicleConfigs.wheels.rims).map((id) => (
                <option key={id} value={id}>
                  {vehicleConfigs.wheels.rims[id].name}
                </option>
              ))}
            </select>
          </div>

          {/* Rim Color */}
          <div className="field field-rim-color">
            <label>Rim Color</label>
            <select value={props.currentVehicle.rim_color} onChange={(e) => props.setVehicle({ rim_color: e.target.value })}>
              <option value="flat_black">Flat Black</option>
              <option value="gloss_black">Gloss Black</option>
              <option value="silver">Silver</option>
              <option value="chrome">Chrome</option>
            </select>
          </div>

          {/* Rim Size */}
          <div className="field field-rim-size">
            <label>Rim Size</label>
            <select value={props.currentVehicle.rim_diameter} onChange={(e) => props.setVehicle({ rim_diameter: e.target.value })}>
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
          </div>

          {/* Rim Width */}
          <div className="field field-rim-width">
            <label>Rim Width</label>
            <select value={props.currentVehicle.rim_width} onChange={(e) => props.setVehicle({ rim_width: e.target.value })}>
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
          </div>

          {/* Tire */}
          <div className="field field-tire">
            <label>Tire Type</label>
            <select value={props.currentVehicle.tire} onChange={(e) => props.setVehicle({ tire: e.target.value })}>
              {Object.keys(vehicleConfigs.wheels.tires).map((id) => (
                <option key={id} value={id}>
                  {vehicleConfigs.wheels.tires[id].name}
                </option>
              ))}
            </select>
          </div>

          {/* Tire Size */}
          <div className="field field-tire-size">
            <label>Tire Size</label>
            <select value={props.currentVehicle.tire_diameter} onChange={(e) => props.setVehicle({ tire_diameter: e.target.value })}>
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
          </div>
        </EditorSection>

        {/* Addons */}
        {addonsExist() && (
          <EditorSection title="Addons" icon={<ToolIcon />}>
            {Object.keys(vehicleConfigs.vehicles[props.currentVehicle.id].addons).map((addon) => (
              <div key={addon} className={`field field-${addon}`}>
                <label>{vehicleConfigs.vehicles[props.currentVehicle.id].addons[addon].name}</label>
                <select value={props.currentVehicle.addons[addon]} required onChange={(e) => props.setVehicle({ addons: { ...props.currentVehicle.addons, [addon]: e.target.value } })}>
                  {!vehicleConfigs.vehicles[props.currentVehicle.id].addons[addon].required && <option value="">None</option>}
                  {Object.keys(vehicleConfigs.vehicles[props.currentVehicle.id].addons[addon].options).map((option) => (
                    <option key={option} value={option}>
                      {vehicleConfigs.vehicles[props.currentVehicle.id].addons[addon].options[option].name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </EditorSection>
        )}

        {/* Scene */}
        <EditorSection title="Options" icon={<GearIcon />}>
          {/* Auto Rotate */}
          <div className="field field-camera-autorotate">
            <input type="checkbox" id="camera-autorotate" checked={props.cameraAutoRotate} onChange={(e) => props.setCameraAutoRotate(e.target.checked)} />
            <label htmlFor="camera-autorotate">Auto Rotate</label>
          </div>

          <div className="field field-editor-request">
            <button onClick={props.requestForm}>Request New Part or Vehicle</button>
          </div>
        </EditorSection>
      </div>
    </div>
  )
}

export default Editor
