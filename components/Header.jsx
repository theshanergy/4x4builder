import VehicleTitle from './VehicleTitle'
import GitHubIcon from '../assets/images/icons/GitHub.svg'

function Header() {
    return (
        <div id='header' className='absolute top-0 h-15 flex items-center justify-between w-full border-none z-50 text-stone-900'>
            <div />



            <VehicleTitle />

            <div className='px-5'>
                <a target='_blank' href='https://github.com/theshanergy/4x4builder' title='GitHub'>
                    <GitHubIcon className='icon' />
                </a>
            </div>
        </div>
    )
}

export default Header
