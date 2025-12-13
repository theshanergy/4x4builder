import { useNavigate } from 'react-router-dom'
import vehicleConfigs from '../../vehicleConfigs'
import useGameStore from '../../store/gameStore'

import RimIcon from '../../assets/images/icons/Rim.svg'
import SuspensionIcon from '../../assets/images/icons/Suspension.svg'
import LightIcon from '../../assets/images/icons/Light.svg'

const FEATURES = [
	{
		icon: RimIcon,
		title: 'Custom Wheels',
		description: 'Choose from a variety of rims and tires to match your style and terrain needs.',
	},
	{
		icon: SuspensionIcon,
		title: 'Lift Kits',
		description: 'Adjust suspension height for improved ground clearance and off-road capability.',
	},
	{
		icon: LightIcon,
		title: 'Light Bars',
		description: 'Add powerful LED lighting for night adventures and improved visibility.',
	},
]

function FeatureCard({ icon: Icon, title, description }) {
	return (
		<div className='bg-stone-800/50 rounded-xl p-6 text-center'>
			<div className='mb-3 flex justify-center'>
				<Icon className='w-12 h-12 fill-current text-stone-300' />
			</div>
			<h3 className='text-lg font-semibold mb-2'>{title}</h3>
			<p className='text-stone-400 text-sm'>{description}</p>
		</div>
	)
}

function SpecItem({ label, value }) {
	return (
		<div>
			<dt className='text-stone-400 text-sm'>{label}</dt>
			<dd className='text-lg font-medium'>{value}</dd>
		</div>
	)
}

function VehicleInfo({ vehicleId }) {
	const navigate = useNavigate()
	const vehicleData = vehicleConfigs.vehicles[vehicleId]
	const setInfoMode = useGameStore((state) => state.setInfoMode)

	// Handle entering the configurator
	const enterConfigurator = () => {
		setInfoMode(false)
		navigate('/')
	}

	if (!vehicleData) {
		return (
			<div className='p-8 text-center'>
				<h1 className='text-2xl font-bold text-white mb-4'>Vehicle Not Found</h1>
				<p className='text-stone-400'>The requested vehicle could not be found.</p>
			</div>
		)
	}

	// Extract year range from vehicle name (e.g., "Toyota 4Runner (2014-2024)" -> "2014-2024")
	const yearMatch = vehicleData.name.match(/\(([^)]+)\)/)
	const yearRange = yearMatch ? yearMatch[1] : ''

	// Get model name without make and year (e.g., "Toyota 4Runner (2014-2024)" -> "4Runner")
	const modelName = vehicleData.name
		.replace(vehicleData.make, '')
		.replace(/\([^)]*\)/g, '')
		.trim()

	const fullName = `${vehicleData.make} ${modelName}`

	const specs = [
		{ label: 'Make', value: vehicleData.make },
		{ label: 'Model', value: modelName },
		{ label: 'Years', value: yearRange || 'N/A' },
		{ label: 'Wheelbase', value: vehicleData.wheelbase ? `${vehicleData.wheelbase}m` : 'N/A' },
	]

	return (
		<div className='wrapper py-16'>
			{/* Features Grid */}
			<section className='grid md:grid-cols-3 gap-8 mb-16'>
				{FEATURES.map((feature) => (
					<FeatureCard key={feature.title} {...feature} />
				))}
			</section>

			{/* Vehicle Specs */}
			<section className='mb-16'>
				<h2 className='text-center'>Vehicle Specifications</h2>
				<div className='bg-stone-800/30 rounded-xl p-6 max-w-2xl mx-auto'>
					<dl className='grid grid-cols-2 gap-4'>
						{specs.map((spec) => (
							<SpecItem key={spec.label} {...spec} />
						))}
					</dl>
				</div>
			</section>

			{/* CTA Section */}
			<section className='text-center py-8'>
				<h2>Ready to Build Your {modelName}?</h2>
				<p className='text-stone-400 mb-6 max-w-xl mx-auto'>
					Customize every detail of your {fullName} in our 3D configurator. Experiment with different wheels, tires, suspension, and accessories.
				</p>
				<button onClick={enterConfigurator} className='mx-auto'>
					Start Building
				</button>
			</section>

			{/* Content */}
			<section className='mt-16 pt-8 border-t border-stone-800'>
				<h2 className='text-xl font-bold mb-4'>About the {fullName}</h2>
				<div className='text-stone-400 space-y-4 text-sm leading-relaxed'>
					<p>
						The {fullName} {yearRange && `(${yearRange})`} is a popular choice for off-road enthusiasts who value reliability and capability. With our 3D configurator,
						you can visualize how different modifications will look on your vehicle before making any purchases.
					</p>
					<p>
						Whether you're planning a mild build with slightly larger tires and a modest lift, or an extreme setup with massive mud tires and maximum ground clearance,
						our configurator helps you see the final result. Experiment with wheel offset, tire diameter, lift height, and lighting options to create your perfect
						off-road machine.
					</p>
				</div>
			</section>
		</div>
	)
}

export default VehicleInfo
