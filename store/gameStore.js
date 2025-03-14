import { create } from 'zustand'

const useGameStore = create((set, get) => {
    return {
        // Game state

        // Camera state
        cameraTarget: { x: 0, y: 0, z: 0 },
        cameraControlsRef: null,
        setCameraTarget: (target) => set({ cameraTarget: target }),
        setCameraControlsRef: (ref) => set({ cameraControlsRef: ref }),
    }
})

export default useGameStore
