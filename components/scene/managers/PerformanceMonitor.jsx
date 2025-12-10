import { Perf } from 'r3f-perf'

/**
 * Performance Monitor - DEV ONLY
 * Shows FPS, memory, draw calls, triangles, and other Three.js stats.
 *
 * To enable: set showPerfMonitor to true below
 * This component is completely excluded from production builds.
 */

// Toggle this to show/hide the performance monitor during development
const showPerfMonitor = true

const PerformanceMonitor = () => {
	if (!showPerfMonitor) return null

	return <Perf position='top-right' minimal={false} showGraph={false} matrixUpdate={false} deepAnalyze={false} style={{ right: '320px' }} />
}

export default PerformanceMonitor
