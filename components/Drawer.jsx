import classNames from 'classnames'

const Drawer = ({ open = true, children, className }) => {
    return (
        <nav
            className={classNames(
                'fixed bottom-0 left-0 w-full max-h-1/2 lg:w-72 lg:h-screen lg:max-h-full overflow-y-auto transition-transform duration-500 scrollbar-none',
                {
                    'translate-x-0 translate-y-0': open,
                    'translate-y-full lg:-translate-x-full': !open,
                },
                className
            )}
            style={{ transitionDuration: '500ms' }}>
            {children}
        </nav>
    )
}

export default Drawer
