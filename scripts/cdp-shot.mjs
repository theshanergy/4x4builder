// Minimal Chrome DevTools Protocol driver for visual verification.
// Usage: start chrome with --remote-debugging-port=9222, then
//   node scripts/cdp-shot.mjs <url> <outPath> <waitMs>
// Relays page console output and saves a screenshot after the wait.

// Uses Node's built-in WebSocket client (Node >= 21).
import { writeFileSync } from 'node:fs'

const targetUrl = process.argv[2] ?? 'https://localhost:5199/'
const outPath = process.argv[3] ?? '/tmp/cdp-shot.png'
const waitMs = Number(process.argv[4] ?? 30000)

const targets = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
if (!page) {
	console.error('no page target found')
	process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let nextId = 0
const pending = new Map()

const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = ++nextId
		pending.set(id, resolve)
		ws.send(JSON.stringify({ id, method, params }))
	})

ws.addEventListener('message', async (event) => {
	const text = typeof event.data === 'string' ? event.data : await event.data.text()
	const msg = JSON.parse(text)
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg.result)
		pending.delete(msg.id)
	} else if (msg.method === 'Runtime.consoleAPICalled') {
		const args = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
		console.log(`[console.${msg.params.type}]`, args)
	} else if (msg.method === 'Runtime.exceptionThrown') {
		console.log('[exception]', msg.params.exceptionDetails?.exception?.description ?? JSON.stringify(msg.params.exceptionDetails))
	}
})

await new Promise((resolve) => ws.addEventListener('open', resolve))
await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url: targetUrl })
await new Promise((resolve) => setTimeout(resolve, waitMs))

const probe = await send('Runtime.evaluate', {
	expression: `(() => {
		const canvas = document.querySelector('canvas')
		return JSON.stringify({ canvas: !!canvas, width: canvas?.width, height: canvas?.height })
	})()`,
	returnByValue: true,
})
console.log('[probe]', probe?.result?.value)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(outPath, Buffer.from(shot.data, 'base64'))
console.log('saved', outPath)
ws.close()
process.exit(0)
