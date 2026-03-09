import { BASE_URL, generateSeoHead, getSeoPageData } from '../config/seo.js'

const SEO_PLACEHOLDER = '<!-- SEO_HEAD -->'
const ROOT_SLUG = ''

function injectSeoHead(html, seoHead) {
	if (!html.includes(SEO_PLACEHOLDER)) {
		throw new Error('SEO placeholder was not found in index.html')
	}

	return html.replace(SEO_PLACEHOLDER, seoHead.trim())
}

function generateSitemapXml(pages) {
	const urls = pages.map((page) => ({
		loc: page.slug ? `/${page.slug}` : '/',
		changefreq: page.slug ? 'weekly' : 'daily',
		priority: page.slug ? '0.8' : '1.0',
	}))

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		(url) => `  <url>
    <loc>${BASE_URL}${url.loc}</loc>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
	)
	.join('\n')}
</urlset>`
}

function getTrimmedSeoHead(page) {
	return generateSeoHead(page.meta, page.vehicle).trim()
}

export default function seoPrerenderPlugin() {
	const pages = getSeoPageData()
	const rootPage = pages.find((page) => page.slug === ROOT_SLUG)

	if (!rootPage) {
		throw new Error('Root SEO page data was not found')
	}

	const rootSeoHead = getTrimmedSeoHead(rootPage)

	return {
		name: 'seo-prerender-plugin',
		enforce: 'post',

		transformIndexHtml(html) {
			return injectSeoHead(html, rootSeoHead)
		},

		generateBundle(_, bundle) {
			const indexAsset = Object.values(bundle).find((chunk) => chunk.type === 'asset' && chunk.fileName === 'index.html')

			if (!indexAsset || typeof indexAsset.source !== 'string') {
				throw new Error('Built index.html asset was not found in the Vite bundle output')
			}

			if (!indexAsset.source.includes(rootSeoHead)) {
				throw new Error('Injected root SEO head was not found in built index.html')
			}

			for (const page of pages) {
				if (page.slug === ROOT_SLUG) continue

				this.emitFile({
					type: 'asset',
					fileName: `${page.slug}/index.html`,
					source: indexAsset.source.replace(rootSeoHead, getTrimmedSeoHead(page)),
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