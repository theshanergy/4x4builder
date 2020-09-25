import React from 'react'

import vehicleConfigs from 'vehicleConfigs'
import EditorSection from './EditorSection'

import VehicleIcon from './icons/Vehicle'
import WheelIcon from './icons/Wheel'
import ToolIcon from './icons/Tool'
import GearIcon from './icons/Gear'

function Editor(props) {
  // Get props.
  const { isActive, currentVehicle = { id: null }, setVehicle, cameraAutoRotate, setCameraAutoRotate, requestForm } = props

  // Check if current vehicle has addons.
  function addonsExist() {
    return currentVehicle.id && Object.keys(vehicleConfigs.vehicles[currentVehicle.id].addons).length > 0 ? true : false
  }

  // Group object by key.
  const groupObjectByKey = (object, key) => {
    const groups = {}
    // Loop through object keys.
    for (const id of Object.keys(object)) {
      const type = object[id][key]
      // Create group key if doesnt exist.
      if (!groups[type]) groups[type] = []
      // Push item to group.
      groups[type].push(id)
    }
    return groups
  }

  // Select list grouped by provided type.
  const GroupedSelect = ({ value, itemList, groupBy, ...restProps }) => {
    // Get list sorted by type.
    const groupedList = groupObjectByKey(itemList, groupBy)

    return (
      <select value={value || ''} {...restProps}>
        {Object.keys(groupedList).map((type) => (
          <optgroup key={type} label={type}>
            {groupedList[type].map((id) => (
              <option key={id} value={id}>
                {itemList[id].name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    )
  }

  // Select list of different ranges in inches.
  const InchRangeSelect = ({ value, min, max, ...restProps }) => {
    let elements = []
    // Build options.
    for (let i = min; i <= max; i++) {
      elements.push(
        <option key={i} value={i}>
          {i}"
        </option>
      )
    }

    return (
      <select value={value || 0} {...restProps}>
        {elements}
      </select>
    )
  }

  return (
    <div id="editor" className={isActive ? 'visible' : ''}>
      {/* Vehicle */}
      <EditorSection title="Vehicle" icon={<VehicleIcon />} defaultActive={true}>
        {/* Vehicle */}
        <div className="field field-vehicle">
          <label>Model</label>
          <GroupedSelect value={currentVehicle.id} itemList={vehicleConfigs.vehicles} groupBy={'make'} onChange={(e) => setVehicle({ id: e.target.value })} />
        </div>

        {/* Vehicle Color */}
        <div className="field field-vehicle-color">
          <label>Paint</label>
          <input type="color" value={currentVehicle.color || ''} onChange={(e) => setVehicle({ color: e.target.value })} />
        </div>

        {/* Vehicle roughness */}
        <div className="field field-vehicle-roughness">
          <select value={currentVehicle.roughness || 0} onChange={(e) => setVehicle({ roughness: e.target.value })}>
            <option value="1">Matte</option>
            <option value="0.5">Semi Gloss</option>
            <option value="0">High Gloss</option>
          </select>
        </div>

        {/* Vehicle Lift */}
        <div className="field field-vehicle-lift">
          <label>Lift</label>
          <InchRangeSelect value={currentVehicle.lift} min={-2} max={8} onChange={(e) => setVehicle({ lift: e.target.value })} />
        </div>
      </EditorSection>

      {/* Wheels */}
      <EditorSection title="Wheels" icon={<WheelIcon />}>
        {/* Wheel Offset */}
        <div className="field field-wheel-offset">
          <label>Wheel Offset</label>
          <input type="range" min="0" max="0.1" step="0.01" value={currentVehicle.wheel_offset || 0} onChange={(e) => setVehicle({ wheel_offset: e.target.value })} />
        </div>

        {/* Rim */}
        <div className="field field-rim">
          <label>Rim Type</label>
          <GroupedSelect value={currentVehicle.rim} itemList={vehicleConfigs.wheels.rims} groupBy={'make'} onChange={(e) => setVehicle({ rim: e.target.value })} />
        </div>

        {/* Rim Color */}
        <div className="field field-rim-color">
          <label>Rim Color</label>
          <select value={currentVehicle.rim_color || ''} onChange={(e) => setVehicle({ rim_color: e.target.value })}>
            <option value="flat_black">Flat Black</option>
            <option value="gloss_black">Gloss Black</option>
            <option value="silver">Silver</option>
            <option value="chrome">Chrome</option>
          </select>
        </div>

        {/* Rim Size */}
        <div className="field field-rim-size">
          <label>Rim Size</label>
          <InchRangeSelect value={currentVehicle.rim_diameter} min={14} max={24} onChange={(e) => setVehicle({ rim_diameter: e.target.value })} />
        </div>

        {/* Rim Width */}
        <div className="field field-rim-width">
          <label>Rim Width</label>
          <InchRangeSelect value={currentVehicle.rim_width} min={8} max={16} onChange={(e) => setVehicle({ rim_width: e.target.value })} />
        </div>

        {/* Tire */}
        <div className="field field-tire">
          <label>Tire Type</label>
          <GroupedSelect value={currentVehicle.tire} itemList={vehicleConfigs.wheels.tires} groupBy={'make'} onChange={(e) => setVehicle({ tire: e.target.value })} />
        </div>

        {/* Tire Size */}
        <div className="field field-tire-size">
          <label>Tire Size</label>
          <InchRangeSelect value={currentVehicle.tire_diameter} min={30} max={40} onChange={(e) => setVehicle({ tire_diameter: e.target.value })} />
        </div>
      </EditorSection>

      {/* Addons */}
      {addonsExist() && (
        <EditorSection title="Addons" icon={<ToolIcon />}>
          {Object.keys(vehicleConfigs.vehicles[currentVehicle.id].addons).map((addon) => (
            <div key={addon} className={`field field-${addon}`}>
              <label>{vehicleConfigs.vehicles[currentVehicle.id].addons[addon].name}</label>
              <select value={currentVehicle.addons[addon]} required onChange={(e) => setVehicle({ addons: { ...currentVehicle.addons, [addon]: e.target.value } })}>
                {!vehicleConfigs.vehicles[currentVehicle.id].addons[addon].required && <option value="">None</option>}
                {Object.keys(vehicleConfigs.vehicles[currentVehicle.id].addons[addon].options).map((option) => (
                  <option key={option} value={option}>
                    {vehicleConfigs.vehicles[currentVehicle.id].addons[addon].options[option].name}
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
          <input type="checkbox" id="camera-autorotate" checked={cameraAutoRotate} onChange={(e) => setCameraAutoRotate(e.target.checked)} />
          <label htmlFor="camera-autorotate">Auto Rotate</label>
        </div>

        <div className="field field-editor-request">
          <button onClick={requestForm}>Request New Part or Vehicle</button>
        </div>
      </EditorSection>
    </div>
  )
}

export default Editor
