import vehicleConfigs from './vehicles.js'

export const BASE_URL = 'https://4x4builder.com'
export const META_IMAGE_PATH = '/assets/images/meta/og.png'

export const defaultMeta = {
	title: '4x4 Builder',
	description:
		'Build and customize your dream 4x4 off-road vehicle in 3D. Customize wheels, tires, suspension, and take it for a virtual test drive.',
	keywords:
		'4x4 builder, off-road vehicle configurator, virtual garage, 3D car configurator, lift kit, off-road wheels, truck builder',
	url: BASE_URL,
}

function escapeHtml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

export function getVehicleBySlug(slug) {
	const vehicles = vehicleConfigs.vehicles

	for (const key in vehicles) {
		if (vehicles[key].slug === slug) {
			return vehicles[key]
		}
	}

	return null
}

export function buildVehicleMeta(vehicle, slug) {
	if (!vehicle) return { ...defaultMeta }

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

export function buildStructuredData(meta, vehicle) {
	const data = []
	const imageUrl = `${BASE_URL}${META_IMAGE_PATH}`

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
			vehicle ? meta.fullName : 'Multiple vehicle brands (Toyota, Jeep, Ford)',
			'Wheel and tire customization',
			'Lift kit options',
			'Color customization',
			'Virtual test drive',
			'Multiplayer mode',
		],
		screenshot: imageUrl,
		image: imageUrl,
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

	data.push({
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: '4x4 Builder',
		url: BASE_URL,
		logo: imageUrl,
		sameAs: [],
	})

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

		data.push({
			'@context': 'https://schema.org',
			'@type': 'Product',
			name: meta.fullName,
			description: meta.description,
			image: imageUrl,
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

export function generateSeoHead(meta, vehicle) {
	const url = meta.url || BASE_URL
	const imageUrl = `${BASE_URL}${META_IMAGE_PATH}`
	const structuredData = buildStructuredData(meta, vehicle)

	return `
		<title>${escapeHtml(meta.title)}</title>
		<meta name="description" content="${escapeHtml(meta.description)}" />
		<meta name="keywords" content="${escapeHtml(meta.keywords)}" />
		<meta property="og:type" content="website" />
		<meta property="og:title" content="${escapeHtml(meta.title)}" />
		<meta property="og:description" content="${escapeHtml(meta.description)}" />
		<meta property="og:url" content="${escapeHtml(url)}" />
		<meta property="og:site_name" content="4x4 Builder" />
		<meta property="og:image" content="${escapeHtml(imageUrl)}" />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="${escapeHtml(meta.title)}" />
		<meta name="twitter:description" content="${escapeHtml(meta.description)}" />
		<meta name="twitter:url" content="${escapeHtml(url)}" />
		<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
		<link rel="canonical" href="${escapeHtml(url)}" />
		${structuredData.map((data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`).join('\n\t\t')}`
}

export function getSeoPageData() {
	const pages = [{ slug: '', vehicle: null, meta: { ...defaultMeta } }]

	for (const vehicle of Object.values(vehicleConfigs.vehicles)) {
		if (!vehicle.slug) continue

		pages.push({
			slug: vehicle.slug,
			vehicle,
			meta: buildVehicleMeta(vehicle, vehicle.slug),
		})
	}

	return pages
}