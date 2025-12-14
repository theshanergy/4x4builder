import vehicleConfigs from '../../vehicleConfigs'
import useGameStore from '../../store/gameStore'
import Logo from './Logo'

import RimIcon from '../../assets/images/icons/Rim.svg'
import SuspensionIcon from '../../assets/images/icons/Suspension.svg'
import LightIcon from '../../assets/images/icons/Light.svg'
import GearIcon from '../../assets/images/icons/Gear.svg'
import VehicleIcon from '../../assets/images/icons/Vehicle.svg'

const PLATFORM_FEATURES = [
	{
		icon: VehicleIcon,
		title: '3D Visualization',
		description: 'See exactly how your modifications look with real-time 3D rendering and accurate measurements.',
	},
	{
		icon: GearIcon,
		title: 'Test Drive',
		description: 'Drive your custom build through realistic terrain with accurate physics simulation.',
	},
	{
		icon: RimIcon,
		title: 'Multiplayer',
		description: 'Join friends in shared sessions to showcase builds and explore together.',
	},
]

const CUSTOMIZATION_OPTIONS = [
	{
		title: 'Suspension & Lift',
		items: ['Configurable lift height', 'Ground clearance preview', 'Approach & departure angles', 'Realistic physics simulation'],
	},
	{
		title: 'Wheels & Tires',
		items: ['Multiple rim brands & styles', 'Configurable rim diameter', 'Configurable tire diameter', 'Adjustable width & offset'],
	},
	{
		title: 'Body & Paint',
		items: ['Custom colors', 'Metallic & matte finishes', 'Bumpers & rock sliders', 'Roof racks & accessories'],
	},
	{
		title: 'Lighting',
		items: ['LED light bars', 'Multiple mounting options', 'Adjustable brightness', 'Real-time preview'],
	},
]

const SpecItem = ({ label, value }) => {
	return (
		<div className='text-center p-4'>
			<dd className='text-2xl font-bold text-white mb-1'>{value}</dd>
			<dt className='text-stone-500 text-xs uppercase tracking-wider'>{label}</dt>
		</div>
	)
}

const VehicleInfo = () => {
	const currentVehicle = useGameStore((state) => state.currentVehicle)
	const vehicleData = vehicleConfigs.vehicles[currentVehicle.body]
	const infoMode = useGameStore((state) => state.infoMode)
	const setInfoMode = useGameStore((state) => state.setInfoMode)

	// Handle entering the configurator
	const enterConfigurator = () => {
		setInfoMode(false)
		window.history.replaceState(null, '', '/')
	}

	if (!vehicleData) {
		return null
	}

	// Get year range from the year field
	const yearRange = vehicleData.year || ''

	// Get model name without make (e.g., "Toyota 4Runner" -> "4Runner")
	const modelName = vehicleData.name.replace(vehicleData.make, '').trim()

	const fullName = `${vehicleData.make} ${modelName}`

	const specs = [
		{ label: 'Make', value: vehicleData.make },
		{ label: 'Model', value: modelName },
		{ label: 'Years', value: yearRange || 'N/A' },
		{ label: 'Wheelbase', value: vehicleData.wheelbase ? `${vehicleData.wheelbase}m` : 'N/A' },
	]

	return (
		<div className={`absolute inset-0 overflow-y-auto transition-opacity duration-500 ${infoMode ? 'opacity-100 pointer-events-auto z-50' : 'opacity-0 pointer-events-none'}`}>
			{/* Logo overlay */}
			<div className='fixed top-0 left-0 text-stone-900 z-10'>
				<Logo />
			</div>

			{/* Hero Section */}
			<section className='relative flex items-end min-h-[70vh] py-16'>
				{/* Gradient overlay for text readability */}
				<div className='absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/90 via-black/50 to-transparent pointer-events-none' />
				<div className='wrapper relative z-10'>
					<div className='max-w-2xl'>
						{yearRange && <p className='inline-block mb-4 px-3 py-1 text-sm font-bold uppercase tracking-widest bg-red-700 text-white rounded-full'>{yearRange}</p>}
						<h1 className='mb-6'>
							<span className='block text-stone-300 text-2xl sm:text-3xl md:text-4xl font-bold normal-case tracking-normal mb-2'>{vehicleData.make}</span>
							<span className='block'>{modelName}</span>
						</h1>
						<p className='text-lg text-stone-400 mb-8 leading-relaxed'>
							Customize every detail in our 3D configurator. Experiment with wheels, tires, suspension, and accessories.
						</p>
						<button onClick={enterConfigurator} className='large'>
							Start Building
						</button>
					</div>
				</div>
			</section>

			{/* Specs Bar */}
			<section className='bg-stone-900/90 backdrop-blur-sm border-y border-stone-800'>
				<div className='wrapper'>
					<dl className='grid grid-cols-2 md:grid-cols-4 divide-x divide-stone-800'>
						{specs.map((spec) => (
							<SpecItem key={spec.label} {...spec} />
						))}
					</dl>
				</div>
			</section>

			{/* Content */}
			<section className='py-24 bg-white text-stone-800'>
				<div className='wrapper space-y-24'>
					{/* About and Platform Features Section - Side by Side */}
					<div className='grid lg:grid-cols-2 gap-12 lg:gap-16'>
						{/* About */}
						<div>
							<h2 className='text-3xl lg:text-4xl mb-8'>About the {modelName}</h2>
							<div className='text-stone-600 space-y-5 leading-relaxed'>
								<p>
									The {fullName} {yearRange && `(${yearRange})`} is a popular choice for 4x4 enthusiasts who value off road capability. With our 3D configurator,
									you can visualize how different modifications will look on your vehicle before making any purchases.
								</p>
								<p>
									Whether you're planning a mild build with slightly larger tires and a modest lift, or an extreme setup with massive mud tires and maximum ground
									clearance, our configurator helps you see the final result. Make informed decisions by seeing exactly how each modification affects your
									vehicle's stance, proportions, and overall appearance.
								</p>
								<p>
									Our platform provides accurate measurements and real-time visualization, making it easier than ever to plan your build. No more guesswork or
									surprises—see your modifications before you buy.
								</p>
							</div>
						</div>

						{/* Platform Features */}
						<div>
							<h2 className='text-3xl lg:text-4xl mb-8'>What You Can Do</h2>
							<div className='space-y-6'>
								{PLATFORM_FEATURES.map((feature) => {
									const Icon = feature.icon
									return (
										<div key={feature.title} className='flex gap-4'>
											<div className='shrink-0'>
												<div className='p-3 bg-stone-100 text-red-600 rounded-xl'>
													<Icon className='w-8 h-8' />
												</div>
											</div>
											<div>
												<h3 className='text-xl font-bold text-stone-900 mb-2'>{feature.title}</h3>
												<p className='text-stone-600 leading-relaxed'>{feature.description}</p>
											</div>
										</div>
									)
								})}
							</div>
						</div>
					</div>

					{/* Divider */}
					<div className='relative'>
						<div className='absolute inset-0 flex items-center'>
							<div className='w-full border-t border-stone-200'></div>
						</div>
						<div className='relative flex justify-center'>
							<span className='bg-white px-6 text-stone-400 text-sm uppercase tracking-widest'>Customization Options</span>
						</div>
					</div>

					{/* Customization Options */}
					<div>
						<div className='text-center max-w-3xl mx-auto mb-16'>
							<h2 className='text-3xl lg:text-4xl mb-6'>Build Your Perfect {modelName}</h2>
							<p className='text-stone-600 text-lg leading-relaxed'>
								Fine-tune every aspect of your build with precise control over suspension, wheels, body modifications, and lighting. All changes are visualized in
								real-time with accurate measurements.
							</p>
						</div>
						<div className='grid md:grid-cols-2 lg:grid-cols-4 gap-8'>
							{CUSTOMIZATION_OPTIONS.map((category) => (
								<div key={category.title} className='bg-stone-50 rounded-2xl p-6 border border-stone-200'>
									<h3 className='text-xl font-bold mb-4 text-stone-900'>{category.title}</h3>
									<ul className='space-y-2'>
										{category.items.map((item) => (
											<li key={item} className='flex items-start text-stone-600 text-sm'>
												<svg className='w-5 h-5 mr-2 text-red-600 flex-shrink-0 mt-0.5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
													<path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
												</svg>
												{item}
											</li>
										))}
									</ul>
								</div>
							))}
						</div>
					</div>

					{/* Divider */}
					<div className='relative'>
						<div className='absolute inset-0 flex items-center'>
							<div className='w-full border-t border-stone-200'></div>
						</div>
						<div className='relative flex justify-center'>
							<span className='bg-white px-6 text-stone-400 text-sm uppercase tracking-widest'>Get Started</span>
						</div>
					</div>

					{/* CTA Section - Moved to bottom */}
					<div className='max-w-4xl mx-auto'>
						<div className='p-12 space-y-8 bg-linear-to-br from-stone-900 to-stone-800 rounded-3xl text-center text-white shadow-2xl'>
							<h2 className='text-3xl lg:text-4xl font-bold'>Ready to Build Your Dream {modelName}?</h2>
							<p className='text-stone-300 text-lg leading-relaxed max-w-2xl mx-auto'>
								Jump into the configurator and start experimenting with different setups. Adjust lift height, wheel offset, tire size, and accessories to create the
								perfect build. It's completely free and runs right in your browser.
							</p>
							<button className='large mx-auto' onClick={enterConfigurator}>
								Launch Configurator
							</button>
						</div>
					</div>
				</div>
			</section>
		</div>
	)
}

export default VehicleInfo
