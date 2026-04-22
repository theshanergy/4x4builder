import { useNavigate } from 'react-router-dom'
import LogoIcon from '../../assets/images/icons/Logo.svg'
import useGameStore from '../../store/gameStore'

const Logo = () => {
	const navigate = useNavigate()
	const setInfoMode = useGameStore((state) => state.setInfoMode)

	const handleClick = () => {
		setInfoMode(false)
		navigate('/')
	}

	return (
		<div className='flex items-center gap-3 mb-5 pb-5 border-b border-white/10 text-2xl font-light tracking-tight text-white cursor-pointer' onClick={handleClick}>
			<LogoIcon className='w-9 shrink-0 text-red-500' />
			<span className='leading-none'>
				<strong className='font-semibold text-white'>4x4</strong>
				<span className='text-white/88'>builder</span>
			</span>
		</div>
	)
}

export default Logo
