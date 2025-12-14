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
		<div className='flex h-15 items-center gap-3 px-5 text-2xl font-light cursor-pointer' onClick={handleClick}>
			<LogoIcon className='w-8' />
			<span>
				<strong className='font-medium'>4x4</strong>builder
			</span>
		</div>
	)
}

export default Logo
