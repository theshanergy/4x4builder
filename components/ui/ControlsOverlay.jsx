import { useState, useEffect } from 'react'
import useInputStore from '../../store/inputStore'
import useGameStore from '../../store/gameStore'
import Joystick from './Joystick'

const Key = ({ children, keyName, setKey }) => {
	const handlers = {
		onMouseDown: () => setKey(keyName, true),
		onMouseUp: () => setKey(keyName, false),
		onMouseLeave: () => setKey(keyName, false),
	}
	return (
		<div
			className='w-12 h-12 flex items-center justify-center border border-white/20 rounded-md bg-black/40 text-white text-lg font-bold backdrop-blur-sm cursor-pointer hover:bg-white/20 active:bg-white/30 transition-colors'
			{...handlers}>
			{children}
		</div>
	)
}

const ResetButton = ({ onClick, className = '' }) => (
	<div
		className={`text-white/80 text-xs bg-black/40 px-3.5 py-1.5 rounded-full backdrop-blur-sm border border-white/10 cursor-pointer hover:bg-white/20 transition-colors ${className}`}
		onClick={onClick}>
		{className ? (
			'Press to Reset'
		) : (
			<>
				Press <span className='font-bold text-white'>R</span> to Reset
			</>
		)}
	</div>
)

const ControlsOverlay = () => {
	const [isMobile, setIsMobile] = useState(false)
	const setInput = useInputStore((state) => state.setInput)
	const setKey = useInputStore((state) => state.setKey)
	const controlsVisible = useGameStore((state) => state.controlsVisible)

	const resetVehicle = () => {
		setKey('r', true)
		setTimeout(() => setKey('r', false), 100)
	}

	useEffect(() => {
		const checkMobile = () => setIsMobile(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 1024)
		checkMobile()
		window.addEventListener('resize', checkMobile)
		return () => window.removeEventListener('resize', checkMobile)
	}, [])

	if (!controlsVisible) return null

	if (isMobile) {
		return (
			<>
				<div className='fixed bottom-24 left-8 z-40'>
					<Joystick label='Steer' onMove={(val) => setInput({ leftStickX: val.x, leftStickY: val.y })} />
				</div>
				<div className='fixed bottom-24 right-8 z-40'>
					<Joystick label='Drive' onMove={(val) => setInput({ rightStickX: val.x, rightStickY: val.y })} />
				</div>
				<div className='fixed top-5 right-15 z-90'>
					<ResetButton onClick={resetVehicle} className='mobile' />
				</div>
			</>
		)
	}

	const arrows = [
		{ key: 'ArrowUp', symbol: '↑' },
		{ key: 'ArrowLeft', symbol: '←' },
		{ key: 'ArrowDown', symbol: '↓' },
		{ key: 'ArrowRight', symbol: '→' },
	]

	return (
		<div className='fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-1 items-center select-none opacity-60 z-40'>
			<Key keyName={arrows[0].key} setKey={setKey}>
				{arrows[0].symbol}
			</Key>
			<div className='flex gap-1'>
				{arrows.slice(1).map((a) => (
					<Key key={a.key} keyName={a.key} setKey={setKey}>
						{a.symbol}
					</Key>
				))}
			</div>
			<div className='mt-2'>
				<ResetButton onClick={resetVehicle} />
			</div>
		</div>
	)
}

export default ControlsOverlay
