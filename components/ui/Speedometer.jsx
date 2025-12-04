import { useState, useEffect, useMemo, useRef } from 'react'
import useGameStore from '../../store/gameStore'

const Speedometer = () => {
	const [isMobile, setIsMobile] = useState(false)
	const [displaySpeed, setDisplaySpeed] = useState(0)
	const physicsEnabled = useGameStore((state) => state.physicsEnabled)
	const vehicleSpeedRef = useGameStore((state) => state.vehicleSpeedRef)
	const rafRef = useRef()
	const lastUpdateRef = useRef(0)

	// Check for mobile/desktop
	useEffect(() => {
		const checkMobile = () => setIsMobile(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 1024)
		checkMobile()
		window.addEventListener('resize', checkMobile)
		return () => window.removeEventListener('resize', checkMobile)
	}, [])

	// Update speed display at a throttled rate (10fps is plenty for UI)
	useEffect(() => {
		if (isMobile || !physicsEnabled) return

		const updateSpeed = (timestamp) => {
			// Throttle updates to ~10fps (every 100ms)
			if (timestamp - lastUpdateRef.current >= 100) {
				const speedKmh = Math.abs(vehicleSpeedRef.current * 3.6)
				setDisplaySpeed(Math.round(speedKmh))
				lastUpdateRef.current = timestamp
			}
			rafRef.current = requestAnimationFrame(updateSpeed)
		}

		rafRef.current = requestAnimationFrame(updateSpeed)
		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current)
		}
	}, [isMobile, physicsEnabled, vehicleSpeedRef])

	// Generate tick marks
	const ticks = useMemo(() => {
		const result = []
		const maxSpeed = 200
		const step = 20

		for (let i = 0; i <= maxSpeed; i += step) {
			const isMajor = i % 40 === 0
			const angle = -135 + (i / maxSpeed) * 270
			result.push({ angle, value: i, isMajor })
		}
		return result
	}, [])

	// Don't render on mobile or when physics are disabled
	if (isMobile || !physicsEnabled) return null

	// Calculate needle rotation (-135deg at 0, +135deg at max)
	const maxSpeed = 200 // Max speed on dial (km/h)
	const normalizedSpeed = Math.min(displaySpeed / maxSpeed, 1)
	const needleRotation = -135 + normalizedSpeed * 270

	return (
		<div className='absolute bottom-22 right-8 z-30 select-none pointer-events-none'>
			<div className='relative w-56 h-56'>
				{/* Outer Bezel/Background */}
				<div className='absolute inset-0 rounded-full bg-black/50 shadow-2xl backdrop-blur-md' />

				{/* Speed arc background */}
				<svg className='absolute inset-0 w-full h-full' viewBox='0 0 100 100'>
					<defs>
						<linearGradient id='speedGradient' x1='0%' y1='0%' x2='100%' y2='0%'>
							<stop offset='0%' stopColor='#ef4444' />
							<stop offset='60%' stopColor='#22c55e' />
							<stop offset='100%' stopColor='#3b82f6' />
						</linearGradient>
						<filter id='glow'>
							<feGaussianBlur stdDeviation='1.5' result='coloredBlur' />
							<feMerge>
								<feMergeNode in='coloredBlur' />
								<feMergeNode in='SourceGraphic' />
							</feMerge>
						</filter>
					</defs>

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
						strokeLinecap='round'
						transform='rotate(135 50 50)'
					/>

					{/* Active arc */}
					<circle
						cx='50'
						cy='50'
						r='42'
						fill='none'
						stroke='url(#speedGradient)'
						strokeWidth='4'
						strokeDasharray={`${normalizedSpeed * 198} 264`}
						strokeDashoffset='0'
						strokeLinecap='round'
						className='transition-all duration-100'
						transform='rotate(135 50 50)'
						filter='url(#glow)'
					/>
				</svg>

				{/* Tick marks and Numbers */}
				{ticks.map(({ angle, value, isMajor }, index) => (
					<div key={index} className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 origin-center' style={{ transform: `rotate(${angle}deg)` }}>
						{/* Tick Line */}
						<div className={`absolute bg-white/60 rounded-full ${isMajor ? 'w-1 h-3' : 'w-0.5 h-2'}`} style={{ top: '-84px', left: '-50%' }} />

						{/* Number */}
						{isMajor && (
							<div
								className='absolute -top-[60px] -left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-white/80 font-mono text-center'
								style={{ transform: `rotate(${-angle}deg)` }}>
								{value}
							</div>
						)}
					</div>
				))}

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
}

export default Speedometer
