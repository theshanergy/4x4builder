import { useEffect } from 'react'
import { DefaultLoadingManager } from 'three'
import useGameStore from '../store/gameStore'

const useLoadingManager = () => {
    const setSceneLoaded = useGameStore((state) => state.setSceneLoaded)

    useEffect(() => {
        DefaultLoadingManager.onStart = () => setSceneLoaded(false)
        DefaultLoadingManager.onLoad = () => setSceneLoaded(true)

        return () => {
            DefaultLoadingManager.onStart = null
            DefaultLoadingManager.onLoad = null
        }
    }, [setSceneLoaded])
}

export default useLoadingManager
