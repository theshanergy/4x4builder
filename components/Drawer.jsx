import React, { useState, useRef, useLayoutEffect } from 'react'
import classNames from 'classnames'
import Gear from '../assets/images/icons/Gear.svg'

const Drawer = ({ id, open: controlledOpen, defaultOpen = true, onToggle, className = '', children }) => {
    const isControlled = controlledOpen !== undefined
    const [internalOpen, setInternalOpen] = useState(defaultOpen)
    const open = isControlled ? controlledOpen : internalOpen

    const [dragging, setDragging] = useState(false)
    const [dragStartY, setDragStartY] = useState(0)
    const [dragTranslate, setDragTranslate] = useState(null)
    const drawerRef = useRef(null)
    const [drawerHeight, setDrawerHeight] = useState(0)

    useLayoutEffect(() => {
        if (drawerRef.current) {
            setDrawerHeight(drawerRef.current.getBoundingClientRect().height)
        }
    }, [children, className])

    const toggleDrawer = (newState) => (isControlled ? onToggle?.(newState) : setInternalOpen(newState))

    const handlePointerDown = (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        setDragging(true)
        setDragStartY(e.clientY)
        setDragTranslate(open ? 0 : drawerHeight)
        e.currentTarget.setPointerCapture(e.pointerId)
    }

    const handlePointerMove = (e) => {
        if (!dragging) return
        const delta = e.clientY - dragStartY
        const base = open ? 0 : drawerHeight
        setDragTranslate(Math.max(0, Math.min(base + delta, drawerHeight)))
    }

    const handlePointerUp = (e) => {
        if (!dragging) return
        setDragging(false)
        e.currentTarget.releasePointerCapture(e.pointerId)
        const delta = e.clientY - dragStartY
        Math.abs(delta) < 5 ? toggleDrawer(!open) : toggleDrawer(dragTranslate < drawerHeight / 2)
        setDragTranslate(null)
    }

    return (
        <div
            id={id}
            ref={drawerRef}
            className={classNames('fixed inset-x-0 bottom-0 z-50 w-full bg-black/80 text-gray-400 transform-gpu', className)}
            style={{
                transform: `translateY(${dragTranslate !== null ? dragTranslate : open ? 0 : drawerHeight}px)`,
                transition: dragging ? 'none' : 'transform 0.3s ease-in-out',
            }}>
            <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className='flex gap-4 py-4 px-10 absolute bottom-full left-8 bg-black/80 text-white/80 pointer-events-auto rounded-t-lg cursor-pointer touch-none'>
                <Gear className='w-6 h-6' />
                <span className='font-semibold'>Configure</span>
            </div>
            <div className='h-[50vh] overflow-y-auto scrollbar-none'>{children}</div>
        </div>
    )
}

export default Drawer
