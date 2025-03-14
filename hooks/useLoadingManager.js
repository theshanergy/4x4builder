import { useEffect, useState } from 'react'
import { DefaultLoadingManager } from 'three'
import useGameStore from '../store/gameStore'

const useLoadingManager = () => {
    const setSceneLoaded = useGameStore((state) => state.setSceneLoaded)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const onStart = () => {
            setIsLoading(true)
        }

        const onLoad = () => {
            setIsLoading(false)
        }

        DefaultLoadingManager.onStart = onStart
        DefaultLoadingManager.onLoad = onLoad

        return () => {
            DefaultLoadingManager.onStart = null
            DefaultLoadingManager.onLoad = null
        }
    }, [])

    // Set scene loaded when loading is complete
    useEffect(() => {
        setSceneLoaded(!isLoading)
    }, [isLoading, setSceneLoaded])
}

export default useLoadingManager
