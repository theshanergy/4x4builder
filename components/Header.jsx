import LogoIcon from '../assets/images/icons/Logo.svg'
import GitHubIcon from '../assets/images/icons/GitHub.svg'

function Header({ children }) {
    return (
        <div id='header'>
            <h1>
                <LogoIcon className='icon' />
                <strong>4x4</strong>builder
            </h1>
            {children}
            <div className='actions'>
                <a target='_blank' href='https://github.com/theshanergy/4x4builder' title='GitHub'>
                    <GitHubIcon className='icon' />
                </a>
            </div>
        </div>
    )
}

export default Header
