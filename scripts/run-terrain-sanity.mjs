// Runs a headless terrain module through Vite's SSR pipeline so the app's
// extensionless imports resolve.
// Run: node scripts/run-terrain-sanity.mjs [module=scripts/terrain-sanity.mjs]
import { createServer } from 'vite'

const target = process.argv[2] ?? 'scripts/terrain-sanity.mjs'

const server = await createServer({
	configFile: false,
	server: { middlewareMode: true },
	logLevel: 'error',
})

try {
	await server.ssrLoadModule('/' + target.replace(/^\.?\//, ''))
} finally {
	await server.close()
}
