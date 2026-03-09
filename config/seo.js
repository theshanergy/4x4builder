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

export function generateSeoTags(meta, vehicle) {
	const url = meta.url || BASE_URL
	const imageUrl = `${BASE_URL}${META_IMAGE_PATH}`
	const structuredData = buildStructuredData(meta, vehicle)

	return [
		{ tag: 'title', children: meta.title },
		{ tag: 'meta', attrs: { name: 'description', content: meta.description } },
		{ tag: 'meta', attrs: { name: 'keywords', content: meta.keywords } },
		{ tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
		{ tag: 'meta', attrs: { property: 'og:title', content: meta.title } },
		{ tag: 'meta', attrs: { property: 'og:description', content: meta.description } },
		{ tag: 'meta', attrs: { property: 'og:url', content: url } },
		{ tag: 'meta', attrs: { property: 'og:site_name', content: '4x4 Builder' } },
		{ tag: 'meta', attrs: { property: 'og:image', content: imageUrl } },
		{ tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
		{ tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
		{ tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
		{ tag: 'meta', attrs: { name: 'twitter:title', content: meta.title } },
		{ tag: 'meta', attrs: { name: 'twitter:description', content: meta.description } },
		{ tag: 'meta', attrs: { name: 'twitter:url', content: url } },
		{ tag: 'meta', attrs: { name: 'twitter:image', content: imageUrl } },
		{ tag: 'link', attrs: { rel: 'canonical', href: url } },
		...structuredData.map((data) => ({
			tag: 'script',
			attrs: { type: 'application/ld+json' },
			children: JSON.stringify(data),
		})),
	]
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