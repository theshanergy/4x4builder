import React, { Suspense } from 'react'
import { Canvas, useThree, useFrame } from 'react-three-fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { BackSide } from 'three'
import Ground from './Scene/Ground'
import Vehicle from './Scene/Vehicle'
import Loader from './Loader'
import TWEEN from 'tween.js'


// Vehicle canvas.
function VehicleCanvas(props) {

  // Camera
  const CameraRotation = ({ cameraAutoRotate }) => {
    // Update it every frame
    useFrame(({ camera }) => {

      // Auto rotate camera.
      if (cameraAutoRotate) {
        let cameraSpeed = 0.001

        let x = camera.position.x
        let z = camera.position.z
        camera.position.x = x * Math.cos(cameraSpeed) + z * Math.sin(cameraSpeed)
        camera.position.z = z * Math.cos(cameraSpeed) - x * Math.sin(cameraSpeed)
      }
      //camera.lookAt([0, 0.75, 0])

      camera.updateMatrixWorld()
    })
    return null
  }

  // Take screenshot.
  const takeScreenshot = () => {

    // const { gl, scene, camera } = useThree()

    // console.log(camera)

    // // Fixed render size.
    // camera.aspect = 1280 / 720
    // camera.updateProjectionMatrix()
    // gl.setSize(1280, 720)

    // gl.render(scene, camera)

    // // Download image.
    // var link = document.createElement('a')
    // link.download = 'filename.png'
    // link.href = gl.domElement.toDataURL('image/png')
    // link.click()

    // // Restore canvas size.
    // //handleWindowResize()
  }

  const Sky = () => {
    return (
      <mesh>
        <boxGeometry attach="geometry" args={[256, 256, 256]} />
        <meshBasicMaterial attach="material" color="#ffffff" args={{ side: BackSide }} />
      </mesh>
    )
  }

  return (
    <div id="vehicle">
      <Canvas
        gl={{ preserveDrawingBuffer: true }}
        camera={{ fov: 24, position: [6, 2, 6] }}
        shadowMap={true}
      >
        <CameraRotation cameraAutoRotate={props.cameraAutoRotate} />
        <OrbitControls minDistance={5} maxDistance={15} maxPolarAngle={Math.PI / 2 - 0.05} />

        <ambientLight />
        <directionalLight args={['#ffffff', 0.5]} position={[0, 20, 0]} castShadow={true} />

        <Suspense fallback={null}>
          <Sky />
          <Ground />
          <fog attach="fog" args={['#ffffff', 10, 100]} />
          <Environment background={false} files={['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']} path={'/assets/images/envmap/'} />
        </Suspense>

        <Suspense fallback={null}>
          <Vehicle vehicle={props.vehicle} />
        </Suspense>

      </Canvas>

      <div id="actions">
        <button id="screenshot-button" onClick={takeScreenshot}>Screenshot</button>
        <button id="save-button" onClick={props.saveVehicle}>Save</button>
      </div>
    </div >
  )

}

export default VehicleCanvas
