import { memo, Suspense } from 'react'

import Rim from './Rim'
import Tire from './Tire'

// Wheels - container component that positions wheel groups
const Wheels = memo(({ rim, rim_diameter, rim_width, rim_color, rim_color_secondary, tire, tire_diameter, tire_muddiness, color, roughness, wheelPositions, wheelRefs, cloneMaterials = false }) => {
	// Create keys that include all properties that require a fresh geometry/model
	// This ensures components remount when these critical props change
	const rimKey = `${rim}-${rim_diameter}-${rim_width}`
	const tireKey = `${tire}-${tire_diameter}-${rim_diameter}-${rim_width}`

	return (
		<group name='Wheels'>
			{wheelPositions.map(({ key, rotation, ...transform }, index) => (
				<group key={key} ref={wheelRefs[index]} {...transform}>
					{/* Add an inner group with the correct visual rotation */}
					<group rotation={rotation}>
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
							<Tire
								key={tireKey}
								tire={tire}
								tire_diameter={tire_diameter}
								tire_muddiness={tire_muddiness}
								rim_diameter={rim_diameter}
								rim_width={rim_width}
							/>
						</Suspense>
					</group>
				</group>
			))}
		</group>
	)
})

export default Wheels
