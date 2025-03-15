import React, { useState, useRef, useLayoutEffect } from 'react'
import classNames from 'classnames'

const Drawer = ({ id, icon, open: controlledOpen, defaultOpen = true, onToggle, className = '', children, placement = 'left', label = 'Configure' }) => {
    const isControlled = controlledOpen !== undefined
    const [internalOpen, setInternalOpen] = useState(defaultOpen)
    const open = isControlled ? controlledOpen : internalOpen

    const [dragging, setDragging] = useState(false)
    const [dragStart, setDragStart] = useState(0)
    const [dragTranslate, setDragTranslate] = useState(null)
    const drawerRef = useRef(null)
    const [drawerSize, setDrawerSize] = useState(0)
    const isVertical = placement === 'left'

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
    const transformStyle = isVertical ? `translateX(${translateValue}px)` : `translateY(${translateValue}px)`

    return (
        <div
            id={id}
            ref={drawerRef}
            className={classNames('fixed bg-black/80 text-gray-400 transform-gpu', isVertical ? 'inset-y-0 left-0 w-72' : 'inset-x-0 bottom-0', className)}
            style={{
                transform: transformStyle,
                transition: dragging ? 'none' : 'transform 0.3s ease-in-out',
            }}>
            <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className={classNames(
                    'flex gap-4 py-4 px-10 absolute bg-black/80 text-white/80 pointer-events-auto cursor-pointer touch-none',
                    isVertical ? 'top-8 left-full rounded-r-lg [writing-mode:vertical-rl]' : 'bottom-full left-8 rounded-t-lg'
                )}>
                {icon}
                <span className='font-semibold'>{label}</span>
            </div>
            <div className={classNames('overflow-y-auto scrollbar-none', isVertical ? 'h-full' : 'h-[50vh]')}>{children}</div>
        </div>
    )
}

export default Drawer
