import { useEffect } from 'react'
import { useLocation, useParams, useNavigate } from 'react-router-dom'
import useGameStore from '../store/gameStore'
import vehicleConfigs from '../vehicleConfigs'

// Hook to load vehicle from URL (handles both ?config= query params and /:slug paths)
export default function useVehicleFromUrl() {
	const location = useLocation()
	const params = useParams()
	const navigate = useNavigate()
	const { setVehicle, setInfoMode } = useGameStore()

	useEffect(() => {
		// First, check for shared config in query params
		const searchParams = new URLSearchParams(location.search)
		const encodedConfig = searchParams.get('config')

		if (encodedConfig) {
			console.log('Loading vehicle from shared url.')
			try {
				const jsonString = decodeURIComponent(encodedConfig)
				const config = JSON.parse(jsonString)

				// Overwrite current vehicle from URL parameter
				useGameStore.setState({ currentVehicle: config })

				// Clear current saved vehicle
				useGameStore.setState((state) => ({
					savedVehicles: {
						...state.savedVehicles,
						current: null,
					},
				}))

				// Clear URL parameters (navigate to root without query params)
				navigate('/', { replace: true })
			} catch (error) {
				console.error('Failed to load vehicle config from URL:', error)
			}
			return
		}

		// Otherwise, check for vehicle slug in path (/:slug)
		const vehicleSlug = params['*'] || params.slug
		if (vehicleSlug) {
			// Find vehicle by slug
			const vehicleId = Object.keys(vehicleConfigs.vehicles).find((key) => vehicleConfigs.vehicles[key].slug === vehicleSlug)

			if (vehicleId) {
				// Set the vehicle config based on URL
				setVehicle({ body: vehicleId })
				// Enable info mode for vehicle pages
				setInfoMode(true)
			} else {
				// Invalid vehicle slug, navigate to home
				console.warn('Invalid vehicle slug:', vehicleSlug)
				navigate('/', { replace: true })
			}
		}
	}, [location.search, location.pathname, params, navigate, setVehicle, setInfoMode])
}
