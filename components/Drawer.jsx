import React, { useState, useRef, useLayoutEffect } from 'react'
import classNames from 'classnames'
import Gear from '../assets/images/icons/Gear.svg'

const Drawer = ({ id, open: controlledOpen, defaultOpen = true, onToggle, className = '', children, direction = 'bottom', label = 'Configure' }) => {
    const isControlled = controlledOpen !== undefined
    const [internalOpen, setInternalOpen] = useState(defaultOpen)
    const open = isControlled ? controlledOpen : internalOpen

    const [dragging, setDragging] = useState(false)
    const [dragStart, setDragStart] = useState(0)
    const [dragTranslate, setDragTranslate] = useState(null)
    const drawerRef = useRef(null)
    const [drawerSize, setDrawerSize] = useState(0)
    const isHorizontal = direction === 'left'

    useLayoutEffect(() => {
        if (drawerRef.current) {
            const { width, height } = drawerRef.current.getBoundingClientRect()
            setDrawerSize(isHorizontal ? width : height)
        }
    }, [children, className, isHorizontal])

    const toggleDrawer = (newState) => (isControlled ? onToggle?.(newState) : setInternalOpen(newState))

    const getCoord = (e) => (isHorizontal ? e.clientX : e.clientY)

    const handlePointerDown = (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        setDragging(true)
        setDragStart(getCoord(e))
        setDragTranslate(open ? 0 : isHorizontal ? -drawerSize : drawerSize)
        e.currentTarget.setPointerCapture(e.pointerId)
    }

    const handlePointerMove = (e) => {
        if (!dragging) return
        const delta = getCoord(e) - dragStart
        const base = open ? 0 : isHorizontal ? -drawerSize : drawerSize
        const newTranslate = isHorizontal ? Math.max(-drawerSize, Math.min(base + delta, 0)) : Math.max(0, Math.min(base + delta, drawerSize))
        setDragTranslate(newTranslate)
    }

    const handlePointerUp = (e) => {
        if (!dragging) return
        e.currentTarget.releasePointerCapture(e.pointerId)
        const delta = getCoord(e) - dragStart
        if (Math.abs(delta) < 5) toggleDrawer(!open)
        else toggleDrawer(isHorizontal ? dragTranslate > -drawerSize / 2 : dragTranslate < drawerSize / 2)
        setDragging(false)
        setDragTranslate(null)
    }

    const drawerClasses = isHorizontal
        ? 'fixed inset-y-0 left-0 z-50 bg-black/80 text-gray-400 transform-gpu w-72'
        : 'fixed inset-x-0 bottom-0 z-50 w-full bg-black/80 text-gray-400 transform-gpu'
    const handleClasses = isHorizontal
        ? 'flex gap-4 py-4 px-10 absolute top-8 left-full bg-black/80 text-white/80 pointer-events-auto rounded-r-lg cursor-pointer touch-none [writing-mode:vertical-rl]'
        : 'flex gap-4 py-4 px-10 absolute bottom-full left-8 bg-black/80 text-white/80 pointer-events-auto rounded-t-lg cursor-pointer touch-none'
    const contentClasses = isHorizontal ? 'w-full overflow-y-auto scrollbar-none' : 'h-[50vh] overflow-y-auto scrollbar-none'
    const transformStyle = isHorizontal
        ? `translateX(${dragTranslate !== null ? dragTranslate : open ? 0 : -drawerSize}px)`
        : `translateY(${dragTranslate !== null ? dragTranslate : open ? 0 : drawerSize}px)`

    return (
        <div
            id={id}
            ref={drawerRef}
            className={classNames(drawerClasses, className)}
            style={{
                transform: transformStyle,
                transition: dragging ? 'none' : 'transform 0.3s ease-in-out',
            }}>
            <div onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} className={handleClasses}>
                <Gear className='w-6 h-6' />
                <span className='font-semibold'>{label}</span>
            </div>
            <div className={contentClasses}>{children}</div>
        </div>
    )
}

export default Drawer
