import { memo } from 'react'
import { Html } from '@react-three/drei'

/**
 * PlayerLabel - Name label displayed above remote vehicles
 */
const PlayerLabel = memo(({ name }) => {
	return (
		<Html
			position={[0, 2.5, 0]}
			center
			distanceFactor={10}
			occlude={false}
			style={{
				pointerEvents: 'none',
				userSelect: 'none',
			}}>
			<div
				style={{
					background: 'rgba(0, 0, 0, 0.7)',
					color: 'white',
					padding: '4px 12px',
					borderRadius: '4px',
					fontSize: '14px',
					fontWeight: '500',
					whiteSpace: 'nowrap',
					fontFamily: 'system-ui, -apple-system, sans-serif',
				}}>
				{name}
			</div>
		</Html>
	)
})

export default PlayerLabel
