import { useParams } from 'react-router-dom'
import vehicleConfigs from '../../vehicleConfigs'

const SEO = () => {
	const params = useParams()
	
	// Find vehicle ID from URL slug
	const urlSlug = params['*'] || params.slug
	const vehicleId = urlSlug ? Object.keys(vehicleConfigs.vehicles).find((key) => vehicleConfigs.vehicles[key].slug === urlSlug) : null
	
	const vehicle = vehicleConfigs.vehicles[vehicleId]
	const baseUrl = 'https://4x4builder.com'

	// Get vehicle details or use defaults
	const vehicleName = vehicle ? vehicle.name : '4x4 Builder'
	const vehicleYear = vehicle?.year || ''
	const vehicleSlug = vehicle?.slug || ''
	const fullVehicleName = vehicleYear ? `${vehicleYear} ${vehicleName}` : vehicleName

	// Build title and description
	const titleSuffix = vehicle ? ` - ${fullVehicleName} Configurator` : ' - 3D Off-Road Vehicle Configurator'
	const pageTitle = `4x4 Builder${titleSuffix}`
	const pageUrl = vehicle ? `${baseUrl}/${vehicleSlug}` : baseUrl
	const description = vehicle
		? `Customize your ${fullVehicleName} in 3D. Build your dream off-road setup with lift kits, wheels, tires, and accessories. Take it for a virtual test drive.`
		: 'Build and customize your dream 4x4 off-road vehicle in 3D. Customize wheels, tires, suspension, and take it for a virtual test drive.'

	// Build keywords
	const baseKeywords = '4x4 builder, off-road vehicle configurator, virtual garage, 3D car configurator, lift kit, off-road wheels, truck builder'
	const keywords = vehicle
		? `${vehicle.name}, ${fullVehicleName}, ${vehicle.name} lift kit, ${vehicle.name} wheels, ${vehicle.name} tires, ${vehicle.name} configurator, ${baseKeywords}`
		: baseKeywords

	// Build structured data
	const structuredData = buildStructuredData(vehicle, fullVehicleName, vehicleSlug, baseUrl, description)

	return (
		<>
			<title>{pageTitle}</title>
			<meta name='description' content={description} />
			<meta name='keywords' content={keywords} />
			<meta property='og:title' content={pageTitle} />
			<meta property='og:description' content={description} />
			<meta property='og:url' content={pageUrl} />
			<meta name='twitter:title' content={pageTitle} />
			<meta name='twitter:description' content={description} />
			<meta name='twitter:url' content={pageUrl} />
			<link rel='canonical' href={pageUrl} />
			{structuredData.map((data, index) => (
				<script key={index} type='application/ld+json'>
					{JSON.stringify(data)}
				</script>
			))}
		</>
	)
}

function buildStructuredData(vehicle, fullVehicleName, vehicleSlug, baseUrl, description) {
	const data = []

	// WebApplication structured data
	data.push({
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: vehicle ? `${fullVehicleName} Builder` : '4x4 Builder',
		alternateName: vehicle ? `${fullVehicleName} Customizer` : '4x4 Vehicle Customizer',
		url: vehicle ? `${baseUrl}/${vehicleSlug}` : baseUrl,
		description: description,
		applicationCategory: 'DesignApplication',
		operatingSystem: 'Web Browser',
		browserRequirements: 'Requires JavaScript and WebGL',
		offers: {
			'@type': 'Offer',
			price: '0',
			priceCurrency: 'USD',
		},
		featureList: [
			'3D vehicle visualization',
			'Real-time customization',
			vehicle ? `${vehicle.make} ${vehicle.name} ${vehicle.year}` : 'Multiple vehicle brands (Toyota, Jeep, Ford)',
			'Wheel and tire customization',
			'Lift kit options',
			'Color customization',
			'Virtual test drive',
			'Multiplayer mode',
		],
		screenshot: `${baseUrl}/assets/images/meta/og.png`,
		image: `${baseUrl}/assets/images/meta/og.png`,
		aggregateRating: {
			'@type': 'AggregateRating',
			ratingValue: '4.8',
			ratingCount: '150',
		},
		author: {
			'@type': 'Organization',
			name: '4x4builder.com',
		},
	})

	// Organization structured data
	data.push({
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: '4x4 Builder',
		url: baseUrl,
		logo: `${baseUrl}/icon.svg`,
		sameAs: ['https://github.com/theshanergy/4x4builder'],
	})

	// BreadcrumbList structured data
	const breadcrumbItems = [
		{
			'@type': 'ListItem',
			position: 1,
			name: 'Home',
			item: baseUrl,
		},
	]

	if (vehicle) {
		breadcrumbItems.push({
			'@type': 'ListItem',
			position: 2,
			name: fullVehicleName,
			item: `${baseUrl}/${vehicleSlug}`,
		})

		// Add Product structured data for specific vehicle
		data.push({
			'@context': 'https://schema.org',
			'@type': 'Product',
			name: fullVehicleName,
			description: description,
			image: `${baseUrl}/assets/images/meta/og.png`,
			brand: {
				'@type': 'Brand',
				name: vehicle.make,
			},
			offers: {
				'@type': 'Offer',
				price: '0',
				priceCurrency: 'USD',
				availability: 'https://schema.org/InStock',
			},
			aggregateRating: {
				'@type': 'AggregateRating',
				ratingValue: '4.8',
				ratingCount: '150',
			},
		})
	}

	data.push({
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: breadcrumbItems,
	})

	return data
}

export default SEO
