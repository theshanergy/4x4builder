import { memo } from 'react'

import Wheel from './Wheel'

// Wheels - container component that positions wheel groups
const Wheels = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, tire_muddiness, color, roughness, wheelPositions, wheelRefs, cloneMaterials = false }) => {
	return (
		<group name='Wheels'>
			{wheelPositions.map(({ key, rotation, ...transform }, index) => (
				<group key={key} ref={wheelRefs[index]} {...transform}>
					{/* Add an inner group with the correct visual rotation */}
					<group rotation={rotation}>
						<Wheel
							rim={rim}
							rim_diameter={rim_diameter}
							rim_width={rim_width}
							rim_color={rim_color}
							rim_color_secondary={rim_color_secondary}
							tire={tire}
							tire_diameter={tire_diameter}
							tire_muddiness={tire_muddiness}
							color={color}
							roughness={roughness}
							cloneMaterials={cloneMaterials}
						/>
					</group>
				</group>
			))}
		</group>
	)
})

export default Wheels
