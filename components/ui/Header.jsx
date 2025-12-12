import useGameStore from '../../store/gameStore'
import VehicleSwitcher from './VehicleSwitcher'
import VolumeOnIcon from '../../assets/images/icons/VolumeOn.svg'
import VolumeOffIcon from '../../assets/images/icons/VolumeOff.svg'

function Header() {
	const muted = useGameStore((state) => state.muted)
	const toggleMute = useGameStore((state) => state.toggleMute)

	return (
		<div id='header' className='absolute top-0 h-15 grid grid-cols-[1fr_auto_1fr] items-stretch w-full border-none z-50 text-stone-900'>
			<div />

			<div className='min-w-0 justify-self-center flex items-center justify-center'>
				<VehicleSwitcher />
			</div>

			<div className='px-5 flex justify-end items-center gap-6'>
				<div onClick={toggleMute} className='text-stone-900/20 cursor-pointer' title={muted ? 'Unmute' : 'Mute'}>
					{muted ? <VolumeOffIcon className='icon' /> : <VolumeOnIcon className='icon' />}
				</div>
			</div>
		</div>
	)
}

export default Header
