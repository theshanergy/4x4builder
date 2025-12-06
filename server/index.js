import http from 'http'
import settings from './config/settings.js'
import WebSocketServer from './src/WebSocketServer.js'

// Create HTTP server
const server = http.createServer((req, res) => {
	// Health check endpoint
	if (req.url === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }))
		return
	}
	
	// Stats endpoint
	if (req.url === '/stats') {
		res.writeHead(200, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify(wsServer.getStats()))
		return
	}
	
	// Default response
	res.writeHead(200, { 'Content-Type': 'text/plain' })
	res.end('4x4 Builder Multiplayer Server')
})

// Create WebSocket server
const wsServer = new WebSocketServer(server)

// Start server
server.listen(settings.port, () => {
	console.log(`🚗 4x4 Builder Multiplayer Server`)
	console.log(`   Listening on port ${settings.port}`)
	console.log(`   Health check: http://localhost:${settings.port}/health`)
	console.log(`   Stats: http://localhost:${settings.port}/stats`)
})

// Graceful shutdown
const shutdown = () => {
	console.log('\nShutting down gracefully...')
	wsServer.shutdown()
	server.close(() => {
		console.log('Server closed')
		process.exit(0)
	})
	
	// Force exit after 5 seconds
	setTimeout(() => {
		console.log('Forcing exit...')
		process.exit(1)
	}, 5000)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
