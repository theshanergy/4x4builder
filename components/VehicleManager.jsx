import useGameStore from '../store/gameStore'
import Vehicle from './Vehicle'

// Vehicle manager component
const VehicleManager = () => {
    // Get current vehicle config
    const body = useGameStore((state) => state.currentVehicle.body)
    const color = useGameStore((state) => state.currentVehicle.color)
    const roughness = useGameStore((state) => state.currentVehicle.roughness)
    const lift = useGameStore((state) => state.currentVehicle.lift)
    const wheel_offset = useGameStore((state) => state.currentVehicle.wheel_offset)
    const rim = useGameStore((state) => state.currentVehicle.rim)
    const rim_diameter = useGameStore((state) => state.currentVehicle.rim_diameter)
    const rim_width = useGameStore((state) => state.currentVehicle.rim_width)
    const rim_color = useGameStore((state) => state.currentVehicle.rim_color)
    const rim_color_secondary = useGameStore((state) => state.currentVehicle.rim_color_secondary)
    const tire = useGameStore((state) => state.currentVehicle.tire)
    const tire_diameter = useGameStore((state) => state.currentVehicle.tire_diameter)
    const addons = useGameStore((state) => state.currentVehicle.addons)

    return (
        <>
            <Vehicle
                body={body}
                color={color}
                roughness={roughness}
                lift={lift}
                wheel_offset={wheel_offset}
                rim={rim}
                rim_diameter={rim_diameter}
                rim_width={rim_width}
                rim_color={rim_color}
                rim_color_secondary={rim_color_secondary}
                tire={tire}
                tire_diameter={tire_diameter}
                addons={addons}
            />
        </>
    )
}

export default VehicleManager
