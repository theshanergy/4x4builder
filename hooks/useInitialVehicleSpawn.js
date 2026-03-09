import { useEffect, useState } from 'react'

import useGameStore, { vehicleState } from '../store/gameStore'

const INITIAL_SPAWN_CLEARANCE = 1.0

const useInitialVehicleSpawn = (physicsWheels) => {
	const terrainHelpers = useGameStore((state) => state.terrainHelpers)
	const [spawnPosition, setSpawnPosition] = useState(null)

	useEffect(() => {
		if (spawnPosition || typeof terrainHelpers?.getHeight !== 'function') return

		let maxTerrainHeight = terrainHelpers.getHeight(0, 0)
		for (const wheel of physicsWheels) {
			const wheelTerrainHeight = terrainHelpers.getHeight(wheel.position.x, wheel.position.z)
			if (wheelTerrainHeight > maxTerrainHeight) {
				maxTerrainHeight = wheelTerrainHeight
			}
		}

		const initialPosition = [0, maxTerrainHeight + INITIAL_SPAWN_CLEARANCE, 0]
		setSpawnPosition(initialPosition)
		vehicleState.position.set(...initialPosition)
	}, [spawnPosition, terrainHelpers, physicsWheels])

	return spawnPosition
}

export default useInitialVehicleSpawn