import { useState, useRef } from 'react'

const Joystick = ({ onMove, className = '', label }) => {
	const containerRef = useRef(null)
	const [position, setPosition] = useState({ x: 0, y: 0 })
	const [active, setActive] = useState(false)
	const pointerId = useRef(null)
	const maxRadius = 40

	const updatePosition = (e) => {
		if (!containerRef.current) return
		const rect = containerRef.current.getBoundingClientRect()
		let dx = e.clientX - (rect.left + rect.width / 2)
		let dy = e.clientY - (rect.top + rect.height / 2)
		const distance = Math.hypot(dx, dy)
		if (distance > maxRadius) {
			const scale = maxRadius / distance
			dx *= scale
			dy *= scale
		}
		setPosition({ x: dx, y: dy })
		onMove({ x: dx / maxRadius, y: dy / maxRadius })
	}

	const reset = () => {
		setActive(false)
		setPosition({ x: 0, y: 0 })
		pointerId.current = null
		onMove({ x: 0, y: 0 })
	}

	const handlePointer = (e) => {
		if (e.type === 'pointerdown' && pointerId.current === null) {
			e.preventDefault()
			pointerId.current = e.pointerId
			e.currentTarget.setPointerCapture(e.pointerId)
			setActive(true)
			updatePosition(e)
		} else if (pointerId.current === e.pointerId) {
			e.preventDefault()
			e.type === 'pointermove' ? updatePosition(e) : reset()
		}
	}

	return (
		<div className={`relative flex flex-col items-center gap-2 ${className}`} style={{ touchAction: 'none' }}>
			<div
				ref={containerRef}
				className={`w-24 h-24 rounded-full bg-black/30 backdrop-blur-sm border border-white/10 flex items-center justify-center touch-none ${active ? 'bg-black/50' : ''}`}
				onPointerDown={handlePointer}
				onPointerMove={handlePointer}
				onPointerUp={handlePointer}
				onPointerCancel={handlePointer}>
				<div
					className='w-10 h-10 rounded-full bg-white/80 shadow-lg absolute pointer-events-none'
					style={{
						transform: `translate(${position.x}px, ${position.y}px)`,
						transition: active ? 'none' : 'transform 0.1s ease-out',
					}}
				/>
			</div>
			{label && <span className='text-white/60 text-xs font-medium select-none'>{label}</span>}
		</div>
	)
}

export default Joystick
