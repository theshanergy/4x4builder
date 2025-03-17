import { useState, useRef, useLayoutEffect } from 'react'
import classNames from 'classnames'

import GearIcon from '../assets/images/icons/Gear.svg'
import CloseIcon from '../assets/images/icons/Close.svg'

// Drawer component
const Drawer = ({ id, open: controlledOpen, defaultOpen = true, onToggle, className = '', isVertical = true, children }) => {
    const drawerRef = useRef(null)
    const isControlled = controlledOpen !== undefined
    const [internalOpen, setInternalOpen] = useState(defaultOpen)
    const [drawerSize, setDrawerSize] = useState(0)
    const [dragging, setDragging] = useState(false)
    const [dragStart, setDragStart] = useState(0)
    const [dragTranslate, setDragTranslate] = useState(null)

    // Get open state
    const open = isControlled ? controlledOpen : internalOpen

    // Get drawer size
    useLayoutEffect(() => {
        if (drawerRef.current) {
            const { width, height } = drawerRef.current.getBoundingClientRect()
            setDrawerSize(isVertical ? width : height)
        }
    }, [isVertical])

    // Toggle drawer
    const toggleDrawer = (newState) => (isControlled ? onToggle?.(newState) : setInternalOpen(newState))

    // Get pointer coordinate
    const getCoord = (e) => (isVertical ? e.clientX : e.clientY)

    // Handle pointer down
    const handlePointerDown = (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        setDragging(true)
        setDragStart(getCoord(e))
        setDragTranslate(open ? 0 : isVertical ? -drawerSize : drawerSize)
        e.currentTarget.setPointerCapture(e.pointerId)
    }

    // Handle pointer move
    const handlePointerMove = (e) => {
        if (!dragging) return
        const delta = getCoord(e) - dragStart
        const base = open ? 0 : isVertical ? -drawerSize : drawerSize
        const newTranslate = isVertical ? Math.max(-drawerSize, Math.min(base + delta, 0)) : Math.max(0, Math.min(base + delta, drawerSize))
        setDragTranslate(newTranslate)
    }

    // Handle pointer up and cancel
    const handlePointerUp = (e) => {
        if (!dragging) return
        e.currentTarget.releasePointerCapture(e.pointerId)
        const delta = getCoord(e) - dragStart
        if (Math.abs(delta) < 5) toggleDrawer(!open)
        else toggleDrawer(isVertical ? dragTranslate > -drawerSize / 2 : dragTranslate < drawerSize / 2)
        setDragging(false)
        setDragTranslate(null)
    }

    // Calculate drawer transform
    const translateValue = dragTranslate ?? (open ? 0 : isVertical ? -drawerSize : drawerSize)

    return (
        <div
            id={id}
            ref={drawerRef}
            className={classNames('fixed z-20 transform-gpu', isVertical ? 'inset-y-0 left-0 w-64' : 'inset-x-0 bottom-0', className)}
            style={{
                transform: isVertical ? `translateX(${translateValue}px)` : `translateY(${translateValue}px)`,
                transition: dragging ? 'none' : 'transform 0.3s ease-in-out',
            }}>
            <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className={classNames(
                    'absolute flex items-center justify-center text-stone-900 rounded pointer-events-auto cursor-pointer touch-none',
                    isVertical ? 'left-full top-4 ml-4 h-6 w-6' : 'bottom-full left-4 mb-4 h-11 w-11 bg-stone-900 text-white p-3'
                )}>
                {open ? <CloseIcon className='w-full' /> : <GearIcon className='w-full' />}
            </div>
            <div className={classNames('overflow-y-auto scrollbar-none', isVertical ? 'h-full' : 'h-[50vh]')}>{children}</div>
        </div>
    )
}

export default Drawer
