import { useRef, useEffect } from 'react'
import { createXRStore, XR, XROrigin } from '@react-three/xr'

import useGameStore from '../../../store/gameStore'

// Create XR store instance
const xrStore = createXRStore({
	hand: { teleportPointer: true },
	controller: { teleportPointer: true },
})

// Default XR origin position (for when not inside vehicle)
const DEFAULT_ORIGIN_POSITION = [0, 0, 5]

// XR Origin component - manages XR origin ref and position
const XROriginController = () => {
	const setXrOriginRef = useGameStore((state) => state.setXrOriginRef)
	const xrOriginRef = useRef(null)

	// Store the ref in gameStore so vehicle can access it
	useEffect(() => {
		setXrOriginRef(xrOriginRef)
		return () => setXrOriginRef(null)
	}, [setXrOriginRef])

	return <XROrigin ref={xrOriginRef} position={DEFAULT_ORIGIN_POSITION} />
}

// XR Manager component - wraps children with XR context and origin
const XRManager = ({ children }) => {
	return (
		<XR store={xrStore}>
			<XROriginController />
			{children}
		</XR>
	)
}

export default XRManager
