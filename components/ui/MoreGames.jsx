const MoreGames = () => {
	return (
		<a
			href='https://terrainrider.com'
			target='_blank'
			rel='noreferrer'
			className='group flex items-center gap-3 rounded-lg border border-white/2 px-3 py-2.5 text-white/70 no-underline transition-all duration-200 hover:border-white/10 hover:bg-white/5 hover:text-white/85'>
			<svg
				viewBox='0 0 64 64'
				aria-hidden='true'
				className='h-9 w-9 flex-none text-red-500/25 transition-all duration-200 group-hover:text-red-500/90 group-hover:-translate-y-px'>
				<path d='M8 52 31.8 11 56 52' fill='none' stroke='currentColor' strokeLinecap='round' strokeLinejoin='round' strokeWidth='5.5' />
				<path d='M18.5 43 31.8 21 45.8 43' fill='none' stroke='currentColor' strokeLinecap='round' strokeLinejoin='round' strokeWidth='5.5' />
				<path d='m31.8 21 6 9.5 4.4-3' fill='none' stroke='currentColor' strokeLinecap='round' strokeLinejoin='round' strokeWidth='5.5' />
			</svg>
			<div className='flex flex-col gap-0.5'>
				<h2 className='mb-0 text-lg font-bold leading-none tracking-[-0.03em] text-white/80 group-hover:text-white/90'>
					Terrain Rider<span className='text-red-500/80'>.</span>
				</h2>
				<p className='text-[10px] font-semibold uppercase leading-[1.2] tracking-[0.1em] text-white/40 group-hover:text-white/50'>Physics-based Bike Game</p>
			</div>
		</a>
	)
}

export default MoreGames
