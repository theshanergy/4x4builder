import { BASE_URL, generateSeoTags, getSeoPageData } from '../config/seo.js'

const ROOT_SLUG = ''

function escapeAttr(value) {
	return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function tagsToHtml(tags) {
	return tags
		.map((descriptor) => {
			const { tag, attrs = {}, children } = descriptor
			const attrStr = Object.entries(attrs)
				.map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
				.join('')

			if (tag === 'title') return `<title>${children}</title>`
			if (children != null) return `<${tag}${attrStr}>${children}</${tag}>`
			return `<${tag}${attrStr} />`
		})
		.join('\n\t\t')
}

function generateSitemapXml(pages) {
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
	.map((page) => {
		const loc = page.slug ? `/${page.slug}` : '/'
		const changefreq = page.slug ? 'weekly' : 'daily'
		const priority = page.slug ? '0.8' : '1.0'
		return `  <url>
    <loc>${BASE_URL}${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
	})
	.join('\n')}
</urlset>`
}

export default function seoPrerenderPlugin() {
	const pages = getSeoPageData()
	const rootPage = pages.find((page) => page.slug === ROOT_SLUG)

	if (!rootPage) {
		throw new Error('Root SEO page data was not found')
	}

	const rootSeoHtml = tagsToHtml(generateSeoTags(rootPage.meta, rootPage.vehicle))

	return {
		name: 'seo-prerender-plugin',
		enforce: 'post',

		transformIndexHtml() {
			return generateSeoTags(rootPage.meta, rootPage.vehicle)
		},

		generateBundle(_, bundle) {
			const indexAsset = Object.values(bundle).find((chunk) => chunk.type === 'asset' && chunk.fileName === 'index.html')

			if (!indexAsset || typeof indexAsset.source !== 'string') {
				throw new Error('Built index.html asset was not found in the Vite bundle output')
			}

			if (!indexAsset.source.includes(rootSeoHtml)) {
				throw new Error('Injected root SEO head was not found in built index.html')
			}

			for (const page of pages) {
				if (page.slug === ROOT_SLUG) continue

				const pageSeoHtml = tagsToHtml(generateSeoTags(page.meta, page.vehicle))

				this.emitFile({
					type: 'asset',
					fileName: `${page.slug}/index.html`,
					source: indexAsset.source.replace(rootSeoHtml, pageSeoHtml),
				})
			}

			this.emitFile({
				type: 'asset',
				fileName: 'sitemap.xml',
				source: generateSitemapXml(pages),
			})
		},
	}
}
