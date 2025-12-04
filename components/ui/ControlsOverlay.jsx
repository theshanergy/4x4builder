import useInputStore from '../../store/inputStore'
import useGameStore from '../../store/gameStore'
import Joystick from './Joystick'

const Key = ({ children, keyName, setKey, onClick, active, wide }) => {
	const handlers = onClick
		? { onClick }
		: {
				onMouseDown: () => setKey(keyName, true),
				onMouseUp: () => setKey(keyName, false),
				onMouseLeave: () => setKey(keyName, false),
		  }
	return (
		<div
			className={`${
				wide ? 'px-3 text-xs flex-col' : 'w-12'
			} h-12 flex items-center justify-center border rounded-md text-white font-bold backdrop-blur-sm cursor-pointer transition-colors ${
				active ? 'border-amber-400/60 bg-amber-500/40 text-amber-200' : 'border-white/20 bg-black/40 hover:bg-white/20 active:bg-white/30'
			}`}
			{...handlers}>
			{children}
		</div>
	)
}

const ControlsOverlay = () => {
	const setTouchInput = useInputStore((state) => state.setTouchInput)
	const setKey = useInputStore((state) => state.setKey)
	const keys = useInputStore((state) => state.keys)
	const isMobile = useGameStore((state) => state.isMobile)
	const controlsVisible = useGameStore((state) => state.controlsVisible)
	const isDrifting = keys.has('Shift')

	const resetVehicle = () => {
		setKey('r', true)
		setTimeout(() => setKey('r', false), 100)
	}

	if (!controlsVisible) return null

	if (isMobile) {
		return (
			<div className='fixed inset-x-4 bottom-20 flex justify-between items-end z-40 pointer-events-none text-sm text-white/50 font-semibold'>
				<div className='flex flex-col items-center gap-4 pointer-events-auto'>
				<div onClick={resetVehicle}>
					<span className='text-lg font-black'>↺</span> Reset
				</div>
				<Joystick onMove={(val) => setTouchInput({ leftStickX: val.x, leftStickY: val.y })} />
			</div>
			<div className='flex flex-col items-center gap-4 pointer-events-auto'>
				<div onTouchStart={() => setKey('Shift', true)} onTouchEnd={() => setKey('Shift', false)}>
					<span className='text-lg font-black'>⇧</span> Drift
				</div>
				<Joystick onMove={(val) => setTouchInput({ rightStickX: val.x, rightStickY: val.y })} />
				</div>
			</div>
		)
	}

	const arrows = [
		{ key: 'ArrowUp', symbol: '↑' },
		{ key: 'ArrowLeft', symbol: '←' },
		{ key: 'ArrowDown', symbol: '↓' },
		{ key: 'ArrowRight', symbol: '→' },
	]

	return (
		<div className='fixed bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-3 select-none opacity-60 z-40'>
			<Key onClick={resetVehicle} active={keys.has('r')} wide>
				<span>Reset</span>
				<span className='text-[10px] text-white/50'>↺ R</span>
			</Key>
			<div className='flex flex-col gap-1 items-center'>
				<Key keyName={arrows[0].key} setKey={setKey} active={keys.has(arrows[0].key)}>
					{arrows[0].symbol}
				</Key>
				<div className='flex gap-1'>
					{arrows.slice(1).map((a) => (
						<Key key={a.key} keyName={a.key} setKey={setKey} active={keys.has(a.key)}>
							{a.symbol}
						</Key>
					))}
				</div>
			</div>
			<Key keyName='Shift' setKey={setKey} active={isDrifting} wide>
				<span>Drift</span>
				<span className='text-[10px] text-white/50'>⇧ Shift</span>
			</Key>
		</div>
	)
}

export default ControlsOverlay
