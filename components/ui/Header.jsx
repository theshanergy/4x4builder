import VehicleSwitcher from './VehicleSwitcher'
import GitHubIcon from '../../assets/images/icons/GitHub.svg'

function Header() {
    return (
        <div id='header' className='absolute top-0 h-15 grid grid-cols-[1fr_auto_1fr] items-stretch w-full border-none z-50 text-stone-900'>
            <div />

            <div className='min-w-0 justify-self-center flex items-center justify-center'>
                <VehicleSwitcher />
            </div>

            <div className='px-5 flex justify-end items-center'>
                <a target='_blank' href='https://github.com/theshanergy/4x4builder' title='GitHub'>
                    <GitHubIcon className='icon' />
                </a>
            </div>
        </div>
    )
}

export default Header
