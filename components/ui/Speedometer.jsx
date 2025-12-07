import { useState, useEffect, useMemo, useRef, memo, useCallback } from 'react'
import useGameStore, { vehicleState } from '../../store/gameStore'
import useMultiplayerStore from '../../store/multiplayerStore'

// Distance scaling for player arrows
const MAX_ARROW_DISTANCE = 500 // Distance at which arrows are fully faded
const MIN_ARROW_DISTANCE = 20 // Distance at which arrows are at full size/opacity

// Pre-created arrow SVG to avoid innerHTML parsing in animation loop
const ARROW_SVG = `<svg viewBox="0 0 10 10" fill="currentColor" style="width:100%;height:100%;filter:drop-shadow(0 0 2px rgba(0,0,0,0.5))"><polygon points="5,0 10,10 0,10"/></svg>`

// Pre-computed tick marks data for RPM gauge (0-10k RPM)
const TICKS = (() => {
	const result = []
	const majorTicks = 11 // 0 through 10 (representing 0-10k RPM)
	const minorTicksBetween = 4 // 4 minor ticks between each major tick
	const totalSegments = (majorTicks - 1) * (minorTicksBetween + 1) // 50 total segments
	for (let i = 0; i <= totalSegments; i++) {
		const isMajor = i % (minorTicksBetween + 1) === 0
		const angle = -135 + (i / totalSegments) * 270
		const value = isMajor ? i / (minorTicksBetween + 1) : null // Major tick values: 0, 1, 2, ... 10
		result.push({ angle, value, isMajor })
	}
	return result
})()

// Memoized tick marks component - never re-renders
const TickMarks = memo(() => (
	<>
		{TICKS.map(({ angle, value, isMajor }, index) => {
			if (!isMajor && index > 35) return null
			return (
				<div key={index} className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 origin-center' style={{ transform: `rotate(${angle}deg)` }}>
					<div className={`absolute rounded-sm ${isMajor ? 'w-0.5 h-3 bg-white/60' : 'w-px h-1.5 bg-white/30'}`} style={{ top: '-84px', left: '-50%' }} />
					{isMajor && (
						<div
							className='absolute -top-16 -left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-white/80 font-mono text-center'
							style={{ transform: `rotate(${-angle}deg)` }}>
							{value}
						</div>
					)}
				</div>
			)
		})}
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

	// Refs for smooth interpolation
	const targetRpmRef = useRef(850)
	const currentRpmRef = useRef(850)
	const needleRef = useRef(null)
	const arcRef = useRef(null)

	// Update player direction arrows via direct DOM manipulation
	const updateArrows = useCallback(() => {
		if (!arrowContainerRef.current || !currentRoom) return

		const remotePlayers = useMultiplayerStore.getState().remotePlayers
		const localPos = vehicleState.position
		const heading = vehicleState.heading
		const activeIds = new Set()

		for (const id in remotePlayers) {
			const player = remotePlayers[id]

			// Position can be at player.position (from updates) or player.transform.position (initial)
			const pos = player.position || player.transform?.position
			if (!pos) continue

			activeIds.add(id)

			// Calculate relative position in world space (X = right, Z = forward in Three.js)
			const dx = pos[0] - localPos.x
			const dz = pos[2] - localPos.z

			// Calculate distance
			const distance = Math.sqrt(dx * dx + dz * dz)

			// Get world-space angle to the remote player
			// atan2(dx, dz) gives angle where 0 = +Z direction, positive = clockwise when viewed from above
			const worldAngle = Math.atan2(dx, dz)

			// Subtract our heading to get the relative angle
			// Negate to match screen coordinates (positive = right on screen)
			const relativeAngle = -(worldAngle - heading)

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
			// relativeAngle: 0 = forward (top of gauge), positive = clockwise
			const arrowX = centerX + Math.sin(relativeAngle) * radius
			const arrowY = centerY - Math.cos(relativeAngle) * radius

			// Arrow SVG points UP by default. Rotate it to point outward from center
			// (indicating the direction where the remote player is located)
			const arrowRotation = (relativeAngle * 180) / Math.PI

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
			// Sample physics values at ~10fps for state updates (speed, gear)
			if (timestamp - lastUpdateRef.current >= 100) {
				const speedKmh = Math.round(Math.abs(vehicleState.speed * 3.6))
				const gear = vehicleState.gear

				setDisplaySpeed((prev) => (prev !== speedKmh ? speedKmh : prev))
				setDisplayGear((prev) => (prev !== gear ? gear : prev))

				// Update target RPM for interpolation
				targetRpmRef.current = vehicleState.rpm

				// Update player arrows
				updateArrows()

				lastUpdateRef.current = timestamp
			}

			// Interpolate RPM smoothly every frame for needle/arc
			const lerpFactor = 0.15 // Adjust for responsiveness vs smoothness
			currentRpmRef.current += (targetRpmRef.current - currentRpmRef.current) * lerpFactor

			// Update needle and arc directly via refs (avoids React re-renders)
			const maxRpm = 10000
			const normalizedRpm = Math.min(currentRpmRef.current / maxRpm, 1)
			const needleRotation = -135 + normalizedRpm * 270
			const clampedRpmRatio = Math.min(normalizedRpm, 0.7)

			if (needleRef.current) {
				needleRef.current.style.transform = `translate(-50%, -50%) rotate(${needleRotation}deg)`
			}
			if (arcRef.current) {
				arcRef.current.setAttribute('stroke-dasharray', `${clampedRpmRatio * 198} 264`)
			}

			// Update display RPM less frequently for gear indicator redline check
			const roundedRpm = Math.round(currentRpmRef.current)
			setDisplayRpm((prev) => (Math.abs(prev - roundedRpm) > 50 ? roundedRpm : prev))

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

	// Redline threshold (engine max RPM is 6200)
	const engineMaxRpm = 6200
	const isRedline = displayRpm > engineMaxRpm * 0.9 // Above 90% of engine max RPM

	return (
		<div className='absolute bottom-22 right-8 z-30 select-none pointer-events-none'>
			{/* Speedometer Gauge */}
			<div className='relative w-56 h-56'>
				{/* Player direction arrows container */}
				{currentRoom && <div ref={arrowContainerRef} className='absolute inset-0 z-20' />}

				{/* Outer Bezel/Background */}
				<div className='absolute inset-0 rounded-full bg-black/50 shadow-2xl backdrop-blur-md' />

				{/* Speed arc background */}
				<svg className='absolute inset-0' viewBox='0 0 100 100'>
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

					{/* Redline arcs (7k-10k) */}
					<circle
						cx='50'
						cy='50'
						r='42'
						fill='none'
						stroke='#ef4444'
						strokeWidth='6'
						strokeDasharray='0 138.6 19.2 0.6 19.2 0.6 19.8 264'
						strokeDashoffset='0'
						transform='rotate(135 50 50)'
						className='opacity-80'
					/>

					{/* RPM arc - clamped to redline */}
					<circle
						ref={arcRef}
						cx='50'
						cy='50'
						r='42'
						fill='none'
						stroke='#22c55e'
						strokeWidth='4'
						strokeDasharray='0 264'
						strokeDashoffset='0'
						transform='rotate(135 50 50)'
					/>
				</svg>

				{/* Tick marks and Numbers - memoized component */}
				<TickMarks />

				{/* Needle */}
				<div
					ref={needleRef}
					className='absolute left-1/2 top-1/2 origin-center'
					style={{
						transform: 'translate(-50%, -50%) rotate(-135deg)',
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
				<div className='absolute inset-0 flex flex-col items-center justify-end pb-6'>
					<span className='text-4xl font-black text-white tabular-nums tracking-tighter drop-shadow-lg'>{displaySpeed}</span>
					<span className='text-[9px] font-bold text-white/60 uppercase'>km/h</span>
				</div>
			</div>
		</div>
	)
})

export default Speedometer
