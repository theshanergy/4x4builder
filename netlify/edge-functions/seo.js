import vehicleConfigs from '../../vehicleConfigs.js'

// SEO configuration
const BASE_URL = 'https://4x4builder.com'

const defaultMeta = {
	title: '4x4 Builder',
	description: 'Build and customize your dream 4x4 off-road vehicle in 3D. Customize wheels, tires, suspension, and take it for a virtual test drive.',
	keywords: '4x4 builder, off-road vehicle configurator, virtual garage, 3D car configurator, lift kit, off-road wheels, truck builder',
}

function buildVehicleMeta(vehicle, slug) {
	if (!vehicle) return { ...defaultMeta, url: BASE_URL }

	const fullName = vehicle.year ? `${vehicle.year} ${vehicle.name}` : vehicle.name
	const url = `${BASE_URL}/${slug}`

	return {
		title: `4x4 Builder - ${fullName} Configurator`,
		description: `Customize your ${fullName} in 3D. Build your dream off-road setup with lift kits, wheels, tires, and accessories. Take it for a virtual test drive.`,
		keywords: `${vehicle.name}, ${fullName}, ${vehicle.name} lift kit, ${vehicle.name} wheels, ${vehicle.name} tires, ${vehicle.name} configurator, ${defaultMeta.keywords}`,
		url,
		fullName,
	}
}

function buildStructuredData(meta, vehicle) {
	const data = []

	// WebApplication
	data.push({
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: vehicle ? `${meta.fullName} Builder` : '4x4 Builder',
		alternateName: vehicle ? `${meta.fullName} Customizer` : '4x4 Vehicle Customizer',
		url: meta.url || BASE_URL,
		description: meta.description,
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
		screenshot: `${BASE_URL}/assets/images/meta/og.png`,
		image: `${BASE_URL}/assets/images/meta/og.png`,
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

	// Organization
	data.push({
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: '4x4 Builder',
		url: BASE_URL,
		logo: `${BASE_URL}/assets/images/meta/og.png`,
		sameAs: [],
	})

	// BreadcrumbList for vehicle pages
	if (vehicle) {
		data.push({
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{
					'@type': 'ListItem',
					position: 1,
					name: 'Home',
					item: BASE_URL,
				},
				{
					'@type': 'ListItem',
					position: 2,
					name: meta.fullName,
					item: meta.url,
				},
			],
		})

		// Product structured data for vehicle pages
		data.push({
			'@context': 'https://schema.org',
			'@type': 'Product',
			name: meta.fullName,
			description: meta.description,
			image: `${BASE_URL}/assets/images/meta/og.png`,
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

	return data
}

function generateMetaTags(meta, vehicle) {
	const structuredData = buildStructuredData(meta, vehicle)
	const url = meta.url || BASE_URL

	return `
		<title>${meta.title}</title>
		<meta name="description" content="${meta.description}" />
		<meta name="keywords" content="${meta.keywords}" />
		
		<!-- Open Graph -->
		<meta property="og:type" content="website" />
		<meta property="og:title" content="${meta.title}" />
		<meta property="og:description" content="${meta.description}" />
		<meta property="og:url" content="${url}" />
		<meta property="og:site_name" content="4x4 Builder" />
		<meta property="og:image" content="${BASE_URL}/assets/images/meta/og.png" />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		
		<!-- Twitter -->
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="${meta.title}" />
		<meta name="twitter:description" content="${meta.description}" />
		<meta name="twitter:url" content="${url}" />
		<meta name="twitter:image" content="${BASE_URL}/assets/images/meta/og.png" />
		
		<!-- Canonical -->
		<link rel="canonical" href="${url}" />
		
		<!-- Structured Data -->
		${structuredData.map((data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`).join('\n\t\t')}`
}

function getVehicleBySlug(slug) {
	const vehicles = vehicleConfigs.vehicles
	for (const key in vehicles) {
		if (vehicles[key].slug === slug) {
			return vehicles[key]
		}
	}
	return null
}

export default async function handler(request, context) {
	const url = new URL(request.url)
	const pathname = url.pathname

	// Get the response from the origin
	const response = await context.next()

	// Only process HTML responses
	const contentType = response.headers.get('content-type')
	if (!contentType || !contentType.includes('text/html')) {
		return response
	}

	// Determine which vehicle (if any) based on path
	const slug = pathname.replace(/^\//, '').replace(/\/$/, '')
	const vehicle = slug ? getVehicleBySlug(slug) : null
	const meta = vehicle ? buildVehicleMeta(vehicle, slug) : { ...defaultMeta }

	// Get the HTML and inject meta tags
	let html = await response.text()

	// Generate and inject meta tags into <head>
	const metaTags = generateMetaTags(meta, vehicle)
	html = html.replace('</head>', `${metaTags}\n\t</head>`)

	return new Response(html, {
		status: response.status,
		headers: {
			...Object.fromEntries(response.headers),
			'content-type': 'text/html; charset=utf-8',
		},
	})
}

export const config = {
	path: ['/', '/*'],
	excludedPath: ['/assets/*', '/*.js', '/*.css', '/*.ico', '/*.svg', '/*.png', '/*.jpg', '/*.webp', '/*.glb', '/*.webmanifest', '/*.txt'],
}
