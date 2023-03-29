import { useEffect, useCallback } from 'react'
import { useThree } from '@react-three/fiber'

export default function Screenshot({ triggerScreenshot, setTriggerScreenshot }) {
    const { gl, scene, camera, size } = useThree()

    // Take screenshot.
    const takeScreenshot = useCallback(() => {
        // Fixed render size.
        const aspect = 1280 / 720
        camera.aspect = aspect
        camera.updateProjectionMatrix()
        gl.setSize(1280, 720)

        gl.render(scene, camera)

        // Download image.
        var link = document.createElement('a')
        link.download = 'filename.png'
        link.href = gl.domElement.toDataURL('image/png')
        link.click()

        // Restore canvas size.
        camera.aspect = size.width / size.height
        camera.updateProjectionMatrix()
        gl.setSize(size.width, size.height)
        gl.render(scene, camera)
    }, [gl, scene, camera, size])

    // Listen for screenshot.
    useEffect(() => {
        if (triggerScreenshot) {
            // Take screenshot.
            takeScreenshot()
            // Reset trigger.
            setTriggerScreenshot(false)
        }
    }, [takeScreenshot, triggerScreenshot, setTriggerScreenshot])

    return null
}
