const MoreGames = () => {
	return (
		<div className='flex flex-col gap-1.5'>
			<p className='px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35'>Play another 4x4builder game</p>
			<a
				href='https://offroadearth.com'
				target='_blank'
				rel='noreferrer'
				className='group flex items-center gap-3 rounded-lg border border-white/2 px-3 py-2.5 text-white/70 no-underline transition-all duration-200 hover:border-white/10 hover:bg-white/5 hover:text-white/85'>
				<svg
					viewBox='0 0 96 96'
					aria-hidden='true'
					className='h-9 w-9 flex-none text-red-500/25 transition-all duration-200 group-hover:text-red-500/90 group-hover:-translate-y-px'>
					<defs>
						<clipPath id='off-road-earth-globe'>
							<circle cx='48' cy='48' r='35' />
						</clipPath>
						<mask id='off-road-earth-route' maskUnits='userSpaceOnUse' x='0' y='0' width='96' height='96'>
							<rect width='96' height='96' fill='white' />
							<path d='M39.5 46c.7 8 9.1 8.4 11.6 14.1 2.6 6-2.2 10.8 9.7 26.4' fill='none' stroke='black' strokeLinecap='round' strokeWidth='7' />
						</mask>
					</defs>
					<circle cx='48' cy='48' r='41' fill='none' stroke='currentColor' strokeWidth='6' />
					<path
						clipPath='url(#off-road-earth-globe)'
						fill='currentColor'
						mask='url(#off-road-earth-route)'
						d='M8 72 29.5 39.5 41.5 52.5 57.5 27 88 65V92H8V72Z'
					/>
					<path d='M48 7v6M48 83v6M7 48h6M83 48h6' fill='none' stroke='currentColor' strokeLinecap='round' strokeWidth='4' />
				</svg>
				<div className='flex flex-col gap-0.5'>
					<h2 className='mb-0 text-lg font-bold leading-none tracking-[-0.03em] text-white/80 group-hover:text-white/90'>
						Off Road Earth<span className='text-red-500/80'>.</span>
					</h2>
					<p className='text-[10px] font-semibold uppercase leading-[1.2] tracking-[0.1em] text-white/40 group-hover:text-white/50'>Open-World Off-Road</p>
				</div>
			</a>
		</div>
	)
}

export default MoreGames
