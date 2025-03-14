import { useEffect, useRef } from 'react'
import { DefaultLoadingManager } from 'three'
import useGameStore from '../store/gameStore'

const useLoadingManager = () => {
    const setSceneLoaded = useGameStore((state) => state.setSceneLoaded)
    const isLoading = useRef(false)

    useEffect(() => {
        DefaultLoadingManager.onStart = () => {
            isLoading.current = true
            setTimeout(() => isLoading.current && setSceneLoaded(false), 0)
        }

        DefaultLoadingManager.onLoad = () => {
            isLoading.current = false
            setSceneLoaded(true)
        }

        return () => {
            DefaultLoadingManager.onStart = DefaultLoadingManager.onLoad = null
        }
    }, [setSceneLoaded])
}

export default useLoadingManager
