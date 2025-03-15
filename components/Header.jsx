import LogoIcon from '../assets/images/icons/Logo.svg'
import GitHubIcon from '../assets/images/icons/GitHub.svg'

function Header({ children }) {
    return (
        <div id='header' className='flex items-center justify-between fixed top-0 h-15 w-full border-none z-50 lg:bg-white/90 lg:shadow-md lg:shadow-black/20'>
            <h1 className='flex h-full items-center gap-2 m-0 px-5 text-2xl font-light lg:w-72 lg:bg-stone-900 lg:text-white'>
                <LogoIcon className='icon' />
                <span>
                    <strong className='font-medium'>4x4</strong>builder
                </span>
            </h1>
            {children}
            <div className='px-5'>
                <a target='_blank' href='https://github.com/theshanergy/4x4builder' title='GitHub'>
                    <GitHubIcon className='icon' />
                </a>
            </div>
        </div>
    )
}

export default Header
