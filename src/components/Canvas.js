import { RepeatWrapping, BackSide } from 'three'
import React, { Suspense } from 'react'
import { Canvas, useThree } from 'react-three-fiber'
import { OrbitControls, Environment, Reflector, fog, useDetectGPU, useTexture } from '@react-three/drei'
import Loader from './Loader'

import Vehicle from './Scene/Vehicle'


function VehicleCanvas(props) {

  const GPUTier = useDetectGPU()


  // const { gl, scene, camera } = useThree()


  // // Take screenshot.
  // const takeScreenshot = () => {
  //   // Fixed render size.
  //   camera.aspect = 1280 / 720
  //   camera.updateProjectionMatrix()
  //   gl.setSize(1280, 720)

  //   gl.render(scene, camera)

  //   // Download image.
  //   var link = document.createElement('a')
  //   link.download = 'filename.png'
  //   link.href = gl.domElement.toDataURL('image/png')
  //   link.click()

  //   // Restore canvas size.
  //   //handleWindowResize()
  // }


  // // Animation frame.
  // useFrame((state) => {


  //   // Auto rotate camera.
  //   if (props.cameraAutoRotate) {
  //     let cameraSpeed = 0.001

  //     let x = this.camera.position.x
  //     let z = this.camera.position.z
  //     this.camera.position.x = x * Math.cos(cameraSpeed) + z * Math.sin(cameraSpeed)
  //     this.camera.position.z = z * Math.cos(cameraSpeed) - x * Math.sin(cameraSpeed)
  //   }
  //   state.camera.lookAt([0, 0.75, 0])

  //   // Update TWEEN.
  //   //TWEEN.update()
  // })


  // Sky.
  const Sky = () => {
    return (
      <mesh>
        <boxGeometry attach="geometry" args={[256, 256, 256]} />
        <meshBasicMaterial attach="material" color="#ffffff" args={{ side: BackSide }} />
      </mesh>
    )
  }

  // Ground.
  const Ground = () => {

    let groundTexture = useTexture('assets/images/ground/ground_tile.png')
    groundTexture.wrapS = RepeatWrapping
    groundTexture.wrapT = RepeatWrapping
    groundTexture.repeat.set(228, 228)

    return (
      <mesh receiveShadow={true} rotation-x={-Math.PI / 2}>
        <circleBufferGeometry args={[96, 96]} attach="geometry" />
        <meshLambertMaterial map={groundTexture} attach="material" color="#aaaaaa" opacity={0.8} transparent={true} />
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
        <fog attach="fog" args={['#ffffff', 10, 100]} />

        <ambientLight />

        <directionalLight args={['#ffffff', 0.5]} position={[0, 20, 0]} castShadow={true} />

        <Suspense fallback={null}>
          <Environment background={false} files={['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']} path={'/assets/images/envmap/'} />
        </Suspense>

        <Sky />

        {/* ground reflector for desktop */}
        {(GPUTier.tier === "0" || GPUTier.isMobile) ? '' : <Reflector
          rotation-x={-Math.PI / 2}
          textureWidth={2048}
          textureHeight={2048}
          color='#777777'
        >
          <circleBufferGeometry args={[96, 96]} attach="geometry" />
        </Reflector>}


        <Suspense fallback={null}>
          <Ground />
        </Suspense>

        <Suspense fallback={null}>
          <Vehicle vehicle={props.vehicle} />
        </Suspense>


        <OrbitControls minDistance={5} maxDistance={15} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>

      <div id="actions">
        {/* <button id="screenshot-button" onClick={takeScreenshot}>
          Screenshot
          </button> */}
        <button id="save-button" onClick={props.saveVehicle}>
          Save
          </button>
      </div>
    </div >
  )

}

export default VehicleCanvas
