import vehicleConfigs from '../../vehicleConfigs'
import EditorSection from './EditorSection'
import useGameStore from '../../store/gameStore'

import VehicleIcon from '../../assets/images/icons/Vehicle.svg'
import SuspensionIcon from '../../assets/images/icons/Suspension.svg'
import PaintIcon from '../../assets/images/icons/Paint.svg'
import RimIcon from '../../assets/images/icons/Rim.svg'
import TireIcon from '../../assets/images/icons/Tire.svg'
import ToolIcon from '../../assets/images/icons/Tool.svg'
import GearIcon from '../../assets/images/icons/Gear.svg'
import LightIcon from '../../assets/images/icons/Light.svg'

function Editor() {
    // Get vehicle state from store using granular selectors
    const body = useGameStore((state) => state.currentVehicle?.body) || null
    const color = useGameStore((state) => state.currentVehicle?.color)
    const roughness = useGameStore((state) => state.currentVehicle?.roughness) || 0
    const lift = useGameStore((state) => state.currentVehicle?.lift)
    const wheel_offset = useGameStore((state) => state.currentVehicle?.wheel_offset) || 0
    const rim = useGameStore((state) => state.currentVehicle?.rim)
    const rim_color = useGameStore((state) => state.currentVehicle?.rim_color)
    const rim_color_secondary = useGameStore((state) => state.currentVehicle?.rim_color_secondary)
    const rim_diameter = useGameStore((state) => state.currentVehicle?.rim_diameter)
    const rim_width = useGameStore((state) => state.currentVehicle?.rim_width)
    const tire = useGameStore((state) => state.currentVehicle?.tire)
    const tire_diameter = useGameStore((state) => state.currentVehicle?.tire_diameter)
    const tire_muddiness = useGameStore((state) => state.currentVehicle?.tire_muddiness) || 0
    const spare = useGameStore((state) => state.currentVehicle?.spare)
    const addons = useGameStore((state) => state.currentVehicle?.addons) || {}
    const lighting = useGameStore((state) => state.currentVehicle?.lighting) || {}

    const setVehicle = useGameStore((state) => state.setVehicle)
    const physicsEnabled = useGameStore((state) => state.physicsEnabled)
    const setPhysicsEnabled = useGameStore((state) => state.setPhysicsEnabled)
    const cameraAutoRotate = useGameStore((state) => state.cameraAutoRotate)
    const setCameraAutoRotate = useGameStore((state) => state.setCameraAutoRotate)

    // Reconstruct currentVehicle for existing code
    const currentVehicle = {
        body,
        color,
        roughness,
        lift,
        wheel_offset,
        rim,
        rim_color,
        rim_color_secondary,
        rim_diameter,
        rim_width,
        tire,
        tire_diameter,
        tire_muddiness,
        spare,
        addons,
        lighting,
    }

    // Memoize vehicle config to avoid repeated lookups
    const vehicleConfig = currentVehicle.body ? vehicleConfigs.vehicles[currentVehicle.body] : null
    const hasAddons = vehicleConfig?.addons && Object.keys(vehicleConfig.addons).length > 0
    const hasSpare = vehicleConfig?.spare_wheel
    const hasLighting = vehicleConfig?.lighting && Object.keys(vehicleConfig.lighting).length > 0

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
                                {itemList[id].name}{itemList[id].year ? ` (${itemList[id].year})` : ''}
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
        <div id='editor'>
            {/* Vehicle */}
            <EditorSection title='Vehicle' icon={<VehicleIcon className='icon' />} defaultActive={true}>
                {/* Vehicle */}
                <div className='field field-vehicle'>
                    <label>Model</label>
                    <GroupedSelect value={currentVehicle.body} itemList={vehicleConfigs.vehicles} groupBy={'make'} onChange={(e) => setVehicle({ body: e.target.value })} />
                </div>
            </EditorSection>

            {/* Paint */}
            <EditorSection title='Paint' icon={<PaintIcon className='icon' />}>
                {/* Paint */}
                <div className='field field-paint'>
                    <div className='field field-vehicle-color'>
                        <label>Paint</label>
                        <input type='color' value={currentVehicle.color || ''} onChange={(e) => setVehicle({ color: e.target.value })} />
                    </div>

                    {/* Roughness */}
                    <div className='field field-vehicle-roughness'>
                        <label style={{ visibility: 'hidden' }}>Finish</label>
                        <select value={currentVehicle.roughness || 0} onChange={(e) => setVehicle({ roughness: parseFloat(e.target.value) })}>
                            <option value='0.6'>Matte</option>
                            <option value='0.2'>Semi Gloss</option>
                            <option value='0'>High Gloss</option>
                        </select>
                    </div>
                </div>
            </EditorSection>

            {/* Suspension */}
            <EditorSection title='Suspension' icon={<SuspensionIcon className='icon' />}>
                {/* Vehicle Lift */}
                <div className='field field-vehicle-lift'>
                    <label>Lift</label>
                    <InchRangeSelect value={currentVehicle.lift} min={-2} max={8} onChange={(e) => setVehicle({ lift: parseInt(e.target.value, 10) })} />
                </div>

                {/* Wheel Offset */}
                <div className='field field-wheel-offset'>
                    <label>Offset</label>
                    <input type='range' min='0' max='0.1' step='0.01' value={currentVehicle.wheel_offset || 0} onChange={(e) => setVehicle({ wheel_offset: parseFloat(e.target.value) })} />
                </div>
            </EditorSection>

            {/* Rims */}
            <EditorSection title='Rims' icon={<RimIcon className='icon' />}>
                {/* Rim */}
                <div className='field field-rim'>
                    <label>Type</label>
                    <GroupedSelect value={currentVehicle.rim} itemList={vehicleConfigs.wheels.rims} groupBy={'make'} onChange={(e) => setVehicle({ rim: e.target.value })} />
                </div>

                {/* Primary Rim Color */}
                <div className='field field-rim-color'>
                    <label>Color</label>
                    <select value={currentVehicle.rim_color || ''} onChange={(e) => setVehicle({ rim_color: e.target.value })}>
                        <option value='flat_black'>Flat Black</option>
                        <option value='gloss_black'>Gloss Black</option>
                        <option value='silver'>Silver</option>
                        <option value='chrome'>Chrome</option>
                        <option value='bronze'>Bronze</option>
                        <option value='body'>Body match</option>
                    </select>
                </div>

                {/* Secondary Rim Color */}
                <div className='field field-rim-color'>
                    <label>Accent</label>
                    <select value={currentVehicle.rim_color_secondary || ''} onChange={(e) => setVehicle({ rim_color_secondary: e.target.value })}>
                        <option value='flat_black'>Flat Black</option>
                        <option value='gloss_black'>Gloss Black</option>
                        <option value='silver'>Silver</option>
                        <option value='chrome'>Chrome</option>
                        <option value='bronze'>Bronze</option>
                        <option value='body'>Body match</option>
                    </select>
                </div>

                {/* Rim Size */}
                <div className='field field-rim-size'>
                    <div className='field field-rim-diameter'>
                        <label>Diameter</label>
                        <InchRangeSelect value={currentVehicle.rim_diameter} min={14} max={24} onChange={(e) => setVehicle({ rim_diameter: parseInt(e.target.value, 10) })} />
                    </div>

                    {/* Rim Width */}
                    <div className='field field-rim-width'>
                        <label>Width</label>
                        <InchRangeSelect value={currentVehicle.rim_width} min={8} max={16} onChange={(e) => setVehicle({ rim_width: parseInt(e.target.value, 10) })} />
                    </div>
                </div>
            </EditorSection>

            {/* Tires */}
            <EditorSection title='Tires' icon={<TireIcon className='icon' />}>
                <div className='field field-tire-type flex gap-4'>
                    {/* Tire */}
                    <div className='field field-tire-type'>
                        <label>Type</label>
                        <GroupedSelect value={currentVehicle.tire} itemList={vehicleConfigs.wheels.tires} groupBy={'make'} onChange={(e) => setVehicle({ tire: e.target.value })} />
                    </div>

                    {/* Tire Size */}
                    <div className='field field-tire-size'>
                        <label>Size</label>
                        <InchRangeSelect value={currentVehicle.tire_diameter} min={30} max={40} onChange={(e) => setVehicle({ tire_diameter: parseInt(e.target.value, 10) })} />
                    </div>
                </div>

                {/* Tire Muddiness */}
                <div className='field field-tire-muddiness'>
                    <label>Muddiness</label>
                    <input type='range' min='0' max='1' step='0.05' value={currentVehicle.tire_muddiness || 0} onChange={(e) => setVehicle({ tire_muddiness: parseFloat(e.target.value) })} />
                </div>
            </EditorSection>

            {/* Addons */}
            {(hasAddons || hasSpare) && (
                <EditorSection title='Addons' icon={<ToolIcon className='icon' />}>
                    {hasAddons && Object.keys(vehicleConfig.addons).map((addon) => (
                        <div key={addon} className={`field field-${addon}`}>
                            <label>{vehicleConfig.addons[addon].name}</label>
                            <select value={currentVehicle.addons[addon] || ''} required onChange={(e) => setVehicle({ addons: { ...currentVehicle.addons, [addon]: e.target.value } })}>
                                {!vehicleConfig.addons[addon].required && <option value=''>None</option>}
                                {Object.keys(vehicleConfig.addons[addon].options).map((option) => (
                                    <option key={option} value={option}>
                                        {vehicleConfig.addons[addon].options[option].name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ))}
                    {hasSpare && (
                        <div className='field field-spare-wheel'>
                            <input
                                type='checkbox'
                                id='spare-wheel'
                                checked={!!currentVehicle.spare}
                                onChange={(e) => setVehicle({ spare: e.target.checked })}
                            />
                            <label htmlFor='spare-wheel'>Spare Wheel</label>
                        </div>
                    )}
                </EditorSection>
            )}

            {/* Lights */}
            {hasLighting && (
                <EditorSection title='Lights' icon={<LightIcon className='icon' />}>
                    {Object.keys(vehicleConfig.lighting).map((lightType) => {
                        const lights = vehicleConfig.lighting[lightType]
                        if (!Array.isArray(lights)) return null
                        
                        return lights.map((light, index) => {
                            const lightKey = `${lightType}_${index}`
                            const isChecked = currentVehicle.lighting[lightType]?.[index] === true
                            
                            return (
                                <div key={lightKey} className={`field field-light-${lightType}`}>
                                    <input
                                        type='checkbox'
                                        id={`light-${lightKey}`}
                                        checked={isChecked}
                                        onChange={(e) => {
                                            const updatedLightType = [...(currentVehicle.lighting[lightType] || [])]
                                            updatedLightType[index] = e.target.checked
                                            setVehicle({ 
                                                lighting: { 
                                                    ...currentVehicle.lighting, 
                                                    [lightType]: updatedLightType 
                                                } 
                                            })
                                        }}
                                    />
                                    <label htmlFor={`light-${lightKey}`}>{light.name}</label>
                                </div>
                            )
                        })
                    })}
                </EditorSection>
            )}

            {/* Scene */}
            <EditorSection title='Scene' icon={<GearIcon className='icon' />}>
                {/* Auto Rotate */}
                <div className='field field-camera-autorotate'>
                    <input type='checkbox' id='camera-autorotate' checked={cameraAutoRotate} onChange={(e) => setCameraAutoRotate(e.target.checked)} />
                    <label htmlFor='camera-autorotate'>Auto Rotate</label>
                </div>

                {/* Physics */}
                <div className='field field-physics'>
                    <input type='checkbox' id='physics' checked={physicsEnabled} onChange={(e) => setPhysicsEnabled(e.target.checked)} />
                    <label htmlFor='physics'>Physics</label>
                </div>
            </EditorSection>
        </div>
    )
}

export default Editor
