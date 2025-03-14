import { create } from 'zustand'

const useGameStore = create((set, get) => {
    return {
        // Game state
        sceneLoaded: false,
        performanceDegraded: false,
        setSceneLoaded: (loaded) => set({ sceneLoaded: loaded }),
        setPerformanceDegraded: (degraded) => set({ performanceDegraded: degraded }),

        // Camera state
        cameraTarget: { x: 0, y: 0, z: 0 },
        cameraControlsRef: null,
        setCameraTarget: (target) => set({ cameraTarget: target }),
        setCameraControlsRef: (ref) => set({ cameraControlsRef: ref }),
    }
})

export default useGameStore
