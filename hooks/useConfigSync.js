import { useEffect, useRef } from 'react'
import useGameStore from '../store/gameStore'
import useMultiplayerStore from '../store/multiplayerStore'

/**
 * Hook to sync local player's vehicle configuration changes to the server
 * Watches for changes in the currentVehicle config and broadcasts them
 */
export function useConfigSync() {
	const currentVehicle = useGameStore((state) => state.currentVehicle)
	const currentRoom = useMultiplayerStore((state) => state.currentRoom)
	const sendVehicleConfig = useMultiplayerStore((state) => state.sendVehicleConfig)
	
	// Keep track of the previous config to detect changes
	const prevConfigRef = useRef(null)
	const isFirstRender = useRef(true)

	useEffect(() => {
		// Skip first render to avoid sending initial config
		if (isFirstRender.current) {
			isFirstRender.current = false
			prevConfigRef.current = JSON.stringify(currentVehicle)
			return
		}

		// Only sync if connected to a room
		if (!currentRoom) {
			prevConfigRef.current = JSON.stringify(currentVehicle)
			return
		}

		// Serialize current config for comparison
		const configString = JSON.stringify(currentVehicle)
		
		// Only send if config actually changed
		if (configString !== prevConfigRef.current) {
			prevConfigRef.current = configString
			
			// Send the updated config to the server
			sendVehicleConfig(currentVehicle)
			
			console.log('[ConfigSync] Vehicle config changed, broadcasting to server')
		}
	}, [currentVehicle, currentRoom, sendVehicleConfig])

	// Send initial config when joining a room
	useEffect(() => {
		if (currentRoom && currentVehicle) {
			// Small delay to ensure connection is stable
			const timeout = setTimeout(() => {
				sendVehicleConfig(currentVehicle)
				console.log('[ConfigSync] Sent initial vehicle config to room')
			}, 100)
			
			return () => clearTimeout(timeout)
		}
	}, [currentRoom?.id]) // Only trigger when room ID changes
}

export default useConfigSync
