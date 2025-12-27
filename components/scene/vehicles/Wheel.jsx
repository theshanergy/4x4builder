import { memo, Suspense } from 'react'

import Rim from './Rim'
import Tire from './Tire'

// Single wheel component - renders a rim and tire together
const Wheel = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, tire_muddiness = 0, color, roughness, cloneMaterials = false }) => {
	// Create keys that include all properties that require a fresh geometry/model
	const rimKey = `${rim}-${rim_diameter}-${rim_width}`
	const tireKey = `${tire}-${tire_diameter}-${rim_diameter}-${rim_width}`

	return (
		<>
			<Suspense fallback={null}>
				<Rim
					key={rimKey}
					rim={rim}
					rim_diameter={rim_diameter}
					rim_width={rim_width}
					rim_color={rim_color}
					rim_color_secondary={rim_color_secondary}
					color={color}
					roughness={roughness}
					cloneMaterials={cloneMaterials}
				/>
			</Suspense>
			<Suspense fallback={null}>
				<Tire key={tireKey} tire={tire} tire_diameter={tire_diameter} tire_muddiness={tire_muddiness} rim_diameter={rim_diameter} rim_width={rim_width} />
			</Suspense>
		</>
	)
})

export default Wheel
