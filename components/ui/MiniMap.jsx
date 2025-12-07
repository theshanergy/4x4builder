import { useEffect, useRef, memo, useCallback } from 'react'
import useMultiplayerStore from '../../store/multiplayerStore'
import { vehicleState } from '../../store/gameStore'

// Map scale: how many world units fit in the map radius
const MAP_SCALE = 200
const UPDATE_INTERVAL = 100 // ~10fps

// Reusable object to avoid allocations
const tempCalc = { relX: 0, relZ: 0, rotatedX: 0, rotatedZ: 0 }

const MiniMap = memo(() => {
	const currentRoom = useMultiplayerStore((state) => state.currentRoom)
	const containerRef = useRef(null)
	const dotsRef = useRef(new Map()) // Track DOM elements by player ID
	const rafRef = useRef()
	const lastUpdateRef = useRef(0)

	// Direct DOM manipulation for smooth updates without React re-renders
	const updatePositions = useCallback((timestamp) => {
		if (timestamp - lastUpdateRef.current >= UPDATE_INTERVAL) {
			const remotePlayers = useMultiplayerStore.getState().remotePlayers
			const localPos = vehicleState.position
			const heading = vehicleState.heading
			const cosH = Math.cos(heading)
			const sinH = Math.sin(heading)

			const activeIds = new Set()

			// Update or create dots for each remote player
			for (const id in remotePlayers) {
				const player = remotePlayers[id]
				if (!player.transform?.position) continue

				activeIds.add(id)
				const pos = player.transform.position

				// Calculate relative position
				tempCalc.relX = (pos[0] - localPos.x) / MAP_SCALE
				tempCalc.relZ = (pos[2] - localPos.z) / MAP_SCALE

				// Rotate by heading
				tempCalc.rotatedX = -(tempCalc.relX * cosH - tempCalc.relZ * sinH)
				tempCalc.rotatedZ = -(tempCalc.relX * sinH + tempCalc.relZ * cosH)

				// Check if out of range before clamping
				const isOutOfRange = Math.abs(tempCalc.rotatedX) > 0.9 || Math.abs(tempCalc.rotatedZ) > 0.9

				// Clamp to map bounds
				const clampedX = Math.max(-0.9, Math.min(0.9, tempCalc.rotatedX))
				const clampedZ = Math.max(-0.9, Math.min(0.9, tempCalc.rotatedZ))

				// Get or create dot element
				let dot = dotsRef.current.get(id)
				if (!dot && containerRef.current) {
					dot = document.createElement('div')
					dot.className = 'absolute w-1.5 h-1.5 rounded-full'
					dot.style.transform = 'translate(-50%, -50%)'
					dot.style.willChange = 'transform, opacity'
					containerRef.current.appendChild(dot)
					dotsRef.current.set(id, dot)
				}

				if (dot) {
					// Convert to percentage (0.45 keeps dots within bounds, *100 for %)
					const percentX = 50 + clampedX * 45
					const percentZ = 50 + clampedZ * 45
					dot.style.left = `${percentX}%`
					dot.style.top = `${percentZ}%`
					dot.style.transform = 'translate(-50%, -50%)'
					dot.style.backgroundColor = player.vehicleConfig?.color || '#555'
					dot.style.opacity = isOutOfRange ? '0.4' : '0.8'
				}
			}

			// Remove dots for players who left
			for (const [id, dot] of dotsRef.current) {
				if (!activeIds.has(id)) {
					dot.remove()
					dotsRef.current.delete(id)
				}
			}

			lastUpdateRef.current = timestamp
		}

		rafRef.current = requestAnimationFrame(updatePositions)
	}, [])

	useEffect(() => {
		if (!currentRoom) return

		rafRef.current = requestAnimationFrame(updatePositions)

		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current)
			// Clean up dots
			dotsRef.current.forEach((dot) => dot.remove())
			dotsRef.current.clear()
		}
	}, [currentRoom, updatePositions])

	// Don't render if not in a room
	if (!currentRoom) return null

	return (
		<div className='absolute top-16 right-4 z-30 select-none pointer-events-none'>
			<div ref={containerRef} className='relative w-16 h-16 lg:w-36 lg:h-36 rounded-lg bg-black/10 backdrop-blur-sm overflow-hidden'>
				<div className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 border-l-4 border-r-4 border-b-10 border-l-transparent border-r-transparent border-b-red-700' />
			</div>
		</div>
	)
})

export default MiniMap
