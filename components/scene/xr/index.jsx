import { lazy, Suspense, useState, useEffect } from 'react'

// Lazy load the full XR provider - only loaded when XR is available
const XRManager = lazy(() => import('./XRManager'))

// Check if WebXR is available (uses native API, no library import needed)
const checkXRSupport = async () => {
	if (!navigator.xr) return false
	try {
		return await navigator.xr.isSessionSupported('immersive-vr')
	} catch {
		return false
	}
}

/**
 * XR - conditionally loads XR support only when WebXR is available.
 * This keeps the XR bundle out of the main bundle for non-VR users.
 *
 * When XR is not supported, children render directly without any XR overhead.
 * When XR is supported, children are wrapped with lazy-loaded XR context and controllers.
 */
const XR = ({ children }) => {
	const [xrSupported, setXrSupported] = useState(false)

	useEffect(() => {
		checkXRSupport().then(setXrSupported)
	}, [])

	// If XR not supported, just render children directly
	if (!xrSupported) {
		return <>{children}</>
	}

	// XR supported - wrap with lazy-loaded XRManager
	return (
		<Suspense fallback={<>{children}</>}>
			<XRManager>{children}</XRManager>
		</Suspense>
	)
}

export default XR
