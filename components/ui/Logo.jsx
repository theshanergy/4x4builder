import LogoIcon from '../../assets/images/icons/Logo.svg'

const Logo = () => {
	return (
		<div className='flex h-15 items-center gap-3 px-5 text-2xl font-light'>
			<LogoIcon className='w-8' />
			<span>
				<strong className='font-medium'>4x4</strong>builder
			</span>
		</div>
	)
}

export default Logo
