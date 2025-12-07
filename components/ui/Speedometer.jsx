import { useState, useEffect, useMemo, useRef, memo, useCallback } from 'react'
import useGameStore, { vehicleState } from '../../store/gameStore'
import useMultiplayerStore from '../../store/multiplayerStore'

// Distance scaling for player arrows
const MAX_ARROW_DISTANCE = 500 // Distance at which arrows are fully faded
const MIN_ARROW_DISTANCE = 20 // Distance at which arrows are at full size/opacity

// Pre-created arrow SVG to avoid innerHTML parsing in animation loop
const ARROW_SVG = `<svg viewBox="0 0 10 10" fill="currentColor" style="width:100%;height:100%;filter:drop-shadow(0 0 2px rgba(0,0,0,0.5))"><polygon points="5,0 10,10 0,10"/></svg>`

// Pre-computed tick marks data
const TICKS = (() => {
	const result = []
	const maxSpeed = 200
	const step = 20
	for (let i = 0; i <= maxSpeed; i += step) {
		const isMajor = i % 40 === 0
		const angle = -135 + (i / maxSpeed) * 270
		result.push({ angle, value: i, isMajor })
	}
	return result
})()

// Memoized tick marks component - never re-renders
const TickMarks = memo(() => (
	<>
		{TICKS.map(({ angle, value, isMajor }, index) => (
			<div key={index} className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 origin-center' style={{ transform: `rotate(${angle}deg)` }}>
				<div className={`absolute bg-white/60 rounded-full ${isMajor ? 'w-1 h-3' : 'w-0.5 h-2'}`} style={{ top: '-84px', left: '-50%' }} />
				{isMajor && (
					<div
						className='absolute -top-[60px] -left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-white/80 font-mono text-center'
						style={{ transform: `rotate(${-angle}deg)` }}>
						{value}
					</div>
				)}
			</div>
		))}
	</>
))
TickMarks.displayName = 'TickMarks'

const Speedometer = memo(() => {
	const [displaySpeed, setDisplaySpeed] = useState(0)
	const [displayRpm, setDisplayRpm] = useState(850)
	const [displayGear, setDisplayGear] = useState(1)
	const isMobile = useGameStore((state) => state.isMobile)
	const physicsEnabled = useGameStore((state) => state.physicsEnabled)
	const currentRoom = useMultiplayerStore((state) => state.currentRoom)
	const rafRef = useRef()
	const lastUpdateRef = useRef(0)
	const arrowContainerRef = useRef(null)
	const arrowsRef = useRef(new Map())

	// Update player direction arrows via direct DOM manipulation
	const updateArrows = useCallback(() => {
		if (!arrowContainerRef.current || !currentRoom) return

		const remotePlayers = useMultiplayerStore.getState().remotePlayers
		const localPos = vehicleState.position
		const heading = vehicleState.heading
		const activeIds = new Set()

		for (const id in remotePlayers) {
			const player = remotePlayers[id]
			if (!player.transform?.position) continue

			activeIds.add(id)
			const pos = player.transform.position

			// Calculate relative position
			const relX = pos[0] - localPos.x
			const relZ = pos[2] - localPos.z

			// Calculate distance
			const distance = Math.sqrt(relX * relX + relZ * relZ)

			// Rotate relative position by heading (same as MiniMap)
			const cosH = Math.cos(heading)
			const sinH = Math.sin(heading)
			const rotatedX = -(relX * cosH - relZ * sinH)
			const rotatedZ = -(relX * sinH + relZ * cosH)

			// Calculate angle from rotated position (rotatedZ is forward, rotatedX is right)
			// atan2(x, -z) gives angle where 0 = up on screen (forward)
			const relativeAngle = Math.atan2(rotatedX, -rotatedZ)

			// Calculate opacity and scale based on distance
			const distanceFactor = Math.max(0, Math.min(1, (MAX_ARROW_DISTANCE - distance) / (MAX_ARROW_DISTANCE - MIN_ARROW_DISTANCE)))
			const opacity = 0.2 + distanceFactor * 0.6 // Range from 0.2 to 0.8
			const scale = 0.6 + distanceFactor * 0.4 // Range from 0.6 to 1.0

			// Get or create arrow element
			let arrow = arrowsRef.current.get(id)
			if (!arrow) {
				arrow = document.createElement('div')
				arrow.className = 'absolute'
				arrow.style.cssText = 'width:10px;height:10px;will-change:transform,opacity'
				arrow.innerHTML = ARROW_SVG
				arrowContainerRef.current.appendChild(arrow)
				arrowsRef.current.set(id, arrow)
			}

			// Position arrow around the speedometer circumference
			// The speedometer is 224px (w-56), so radius is 112px, we want arrows just outside
			const radius = 110 // Slightly inside the outer edge
			const centerX = 112 // Half of 224px
			const centerY = 112

			// Calculate arrow position on the circle
			const arrowX = centerX + Math.sin(relativeAngle) * radius
			const arrowY = centerY - Math.cos(relativeAngle) * radius

			// Arrow should point toward the player (inward toward center, rotated to show direction)
			const arrowRotation = (relativeAngle * 180) / Math.PI + 180

			arrow.style.left = `${arrowX}px`
			arrow.style.top = `${arrowY}px`
			arrow.style.transform = `translate(-50%, -50%) rotate(${arrowRotation}deg) scale(${scale})`
			arrow.style.color = player.vehicleConfig?.color || '#ffffff'
			arrow.style.opacity = opacity
		}

		// Remove arrows for players who left
		for (const [id, arrow] of arrowsRef.current) {
			if (!activeIds.has(id)) {
				arrow.remove()
				arrowsRef.current.delete(id)
			}
		}
	}, [currentRoom])

	// Combined animation loop for speed and arrows
	useEffect(() => {
		if (isMobile || !physicsEnabled) return

		const update = (timestamp) => {
			// Throttle updates to ~10fps (every 100ms)
			if (timestamp - lastUpdateRef.current >= 100) {
				const speedKmh = Math.round(Math.abs(vehicleState.speed * 3.6))
				const rpm = Math.round(vehicleState.rpm)
				const gear = vehicleState.gear

				setDisplaySpeed((prev) => (prev !== speedKmh ? speedKmh : prev))
				setDisplayRpm((prev) => (prev !== rpm ? rpm : prev))
				setDisplayGear((prev) => (prev !== gear ? gear : prev))

				// Update player arrows
				updateArrows()

				lastUpdateRef.current = timestamp
			}
			rafRef.current = requestAnimationFrame(update)
		}

		rafRef.current = requestAnimationFrame(update)
		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current)
			// Clean up arrows
			arrowsRef.current.forEach((arrow) => arrow.remove())
			arrowsRef.current.clear()
		}
	}, [isMobile, physicsEnabled, updateArrows])

	// Don't render on mobile or when physics are disabled
	if (isMobile || !physicsEnabled) return null

	// Calculate needle rotation (-135deg at 0, +135deg at max)
	const maxSpeed = 200 // Max speed on dial (km/h)
	const normalizedSpeed = Math.min(displaySpeed / maxSpeed, 1)
	const needleRotation = -135 + normalizedSpeed * 270

	// RPM calculations (matching TRANSMISSION constants from useVehiclePhysics)
	const maxRpm = 6200
	const normalizedRpm = Math.min(displayRpm / maxRpm, 1)
	const isRedline = normalizedRpm > 0.9 // Above 90% of max RPM

	// Memoize RPM arc stroke color to avoid recalculating on every render
	const rpmStrokeColor = normalizedRpm > 0.9 ? '#ef4444' : normalizedRpm > 0.8 ? '#f97316' : '#22c55e'

	return (
		<div className='absolute bottom-22 right-8 z-30 select-none pointer-events-none'>
			{/* Speedometer Gauge */}
			<div className='relative w-56 h-56'>
				{/* Player direction arrows container */}
				{currentRoom && <div ref={arrowContainerRef} className='absolute inset-0 z-20' />}

				{/* Outer Bezel/Background */}
				<div className='absolute inset-0 rounded-full bg-black/50 shadow-2xl backdrop-blur-md' />

				{/* Speed arc background */}
				<svg className='absolute inset-0 w-full h-full' viewBox='0 0 100 100'>
					{/* Background arc */}
					<circle
						cx='50'
						cy='50'
						r='42'
						fill='none'
						stroke='rgba(255,255,255,0.1)'
						strokeWidth='6'
						strokeDasharray='198 264'
						strokeDashoffset='0'
						transform='rotate(135 50 50)'
					/>

					{/* RPM arc - color based on current RPM level */}
					<circle
						cx='50'
						cy='50'
						r='42'
						fill='none'
						stroke={rpmStrokeColor}
						strokeWidth='4'
						strokeDasharray={`${normalizedRpm * 198} 264`}
						strokeDashoffset='0'
						transform='rotate(135 50 50)'
						className='transition-[stroke] duration-150'
					/>
				</svg>

				{/* Tick marks and Numbers - memoized component */}
				<TickMarks />

				{/* Needle */}
				<div
					className='absolute left-1/2 top-1/2 origin-center transition-transform duration-100'
					style={{
						transform: `translate(-50%, -50%) rotate(${needleRotation}deg)`,
						filter: 'drop-shadow(0 0 2px rgba(239, 68, 68, 0.5))',
					}}>
					<svg width='20' height='120' viewBox='0 0 20 120' style={{ transform: 'translateY(-45px)' }}>
						<path d='M 8 120 L 12 120 L 10 0 Z' fill='#ef4444' />
					</svg>
				</div>

				{/* Center cap */}
				<div className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-stone-800 shadow-lg z-10' />

				{/* Gear indicator - R12345 display */}
				<div className='absolute inset-0 flex items-center justify-center' style={{ marginTop: '-28px' }}>
					<div className='flex gap-1.5 text-sm font-bold font-mono'>
						{['R', '1', '2', '3', '4', '5'].map((gear) => {
							const isActive = (gear === 'R' && displayGear === -1) || (gear !== 'R' && parseInt(gear) === displayGear)
							return (
								<span
									key={gear}
									className={`transition-all duration-150 ${
										isActive ? (gear === 'R' ? 'text-red-500 scale-110' : isRedline ? 'text-red-500 scale-110' : 'text-green-500 scale-110') : 'text-white/30'
									}`}>
									{gear}
								</span>
							)
						})}
					</div>
				</div>

				{/* Speed display */}
				<div className='absolute inset-0 flex flex-col items-center justify-end pb-8'>
					<div className='flex items-baseline gap-1'>
						<span className='text-4xl font-black text-white tabular-nums tracking-tighter drop-shadow-lg'>{displaySpeed}</span>
						<span className='text-xs font-bold text-white/60 uppercase'>km/h</span>
					</div>
				</div>
			</div>
		</div>
	)
})

export default Speedometer
