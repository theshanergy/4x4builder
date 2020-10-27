import React, { Component } from 'react'
import * as THREE from 'three'
import Loader from './Loader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { isMobileOnly } from 'react-device-detect'

import vehicleConfigs from 'vehicleConfigs'
import TWEEN from 'tween.js'

class VehicleCanvas extends Component {
  constructor(props) {
    super(props)
    this.state = { loading: false, loadingMessage: '' }
  }
  componentDidUpdate(prevProps) {
    this.handleConfigChange(prevProps)
  }
  componentDidMount() {
    this.startLoader()
    this.sceneSetup()
    this.startAnimationLoop()
    window.addEventListener('resize', this.handleWindowResize)

    // Add scene to inspector.
    window.scene = this.scene
  }

  // Handle vehicle configuration change.
  handleConfigChange = (prevProps) => {
    // Model.
    if (prevProps.vehicle.id !== this.props.vehicle.id) {
      // If switching vehicles (ie not first load).
      if (prevProps.vehicle.id) {
        // Clear all existing addons.
        for (var i = this.addons.children.length - 1; i >= 0; i--) {
          this.addons.remove(this.addons.children[i])
        }
        // Set default addons.
        this.props.setVehicle({ addons: vehicleConfigs.vehicles[this.props.vehicle.id].default_addons })
      }
      // Load vehicle.
      this.loadVehicle()
    }
    // Paint.
    if (prevProps.vehicle.color !== this.props.vehicle.color || prevProps.vehicle.roughness !== this.props.vehicle.roughness) {
      this.setObjectColor(this.vehicleContainer)
    }
    // Lift height.
    if (prevProps.vehicle.lift !== this.props.vehicle.lift) {
      this.setVehiclePosY()
    }
    // Wheel offset.
    if (prevProps.vehicle.wheel_offset !== this.props.vehicle.wheel_offset) {
      this.setWheelPos()
    }
    // Rims.
    if (prevProps.vehicle.rim !== this.props.vehicle.rim) {
      this.loadRims()
    }
    // Rim paint.
    if (prevProps.vehicle.rim_color !== this.props.vehicle.rim_color || prevProps.vehicle.rim_color_secondary !== this.props.vehicle.rim_color_secondary) {
      this.setObjectColor(this.rim)
    }
    // Tires.
    if (prevProps.vehicle.tire !== this.props.vehicle.tire) {
      this.loadTires()
    }
    // Wheel size.
    if (prevProps.vehicle.rim_diameter !== this.props.vehicle.rim_diameter || prevProps.vehicle.rim_width !== this.props.vehicle.rim_width || prevProps.vehicle.tire_diameter !== this.props.vehicle.tire_diameter) {
      this.setWheelSize()
    }

    // Addons.
    if (prevProps.vehicle.addons !== this.props.vehicle.addons) {
      for (const addon of Object.keys(this.props.vehicle.addons)) {
        if (this.props.vehicle.addons[addon] !== prevProps.vehicle.addons[addon]) {
          this.loadVehicleAddon(addon)
        }
      }
    }
  }

  // Start loading manager.
  startLoader = () => {
    THREE.DefaultLoadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
      this.setState({
        loading: true,
      })
    }
    THREE.DefaultLoadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
      this.setState({
        loadingMessage: url,
      })
      //console.log('Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.')
    }
    THREE.DefaultLoadingManager.onLoad = () => {
      this.setState({
        loading: false,
      })
    }
    THREE.DefaultLoadingManager.onError = (error) => {
      console.log('loading error:', error)
    }
  }

  // Set up scene.
  sceneSetup = () => {
    // Create scene.
    this.scene = new THREE.Scene()

    // Create renderer and set size.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setSize(this.mount.offsetWidth, this.mount.offsetHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Attach three canvas.
    this.mount.appendChild(this.renderer.domElement)

    // Add camera.
    this.camera = new THREE.PerspectiveCamera(24, this.mount.offsetWidth / this.mount.offsetHeight, 0.1, 500)
    this.camera.position.x = 6 //
    this.camera.position.y = 2 // height
    this.camera.position.z = 6
    this.scene.add(this.camera)

    // Camera controls.
    this.cameraControls = new OrbitControls(this.camera, this.renderer.domElement)
    this.cameraControls.minDistance = 4
    this.cameraControls.maxDistance = 12
    this.cameraControls.maxPolarAngle = Math.PI / 2 - 0.05
    this.cameraControls.enableDamping = true

    // Lighting.
    this.scene.add(new THREE.AmbientLight(0xffffff))

    let light = new THREE.DirectionalLight(0xffffff, 0.5)
    light.position.set(0, 20, 0)
    light.castShadow = true
    light.shadow.camera.far = 50
    this.scene.add(light)

    // Environment map.
    let envMapURL = 'assets/images/envmap/'
    let envMapURLS = [envMapURL + 'px.png', envMapURL + 'nx.png', envMapURL + 'py.png', envMapURL + 'ny.png', envMapURL + 'pz.png', envMapURL + 'nz.png']
    this.envMap = new THREE.CubeTextureLoader().load(envMapURLS)
    this.envMap.mapping = THREE.CubeReflectionMapping

    // Sky.
    var skyGeometry = new THREE.BoxGeometry(256, 256, 256)
    var skyMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.BackSide,
    })
    var skyMesh = new THREE.Mesh(skyGeometry, skyMaterial)
    skyMesh.name = 'Sky'
    this.scene.add(skyMesh)

    // Fog
    this.scene.fog = new THREE.Fog(0xffffff, 10, 100)

    // Ground.
    let groundGeometry = new THREE.CircleBufferGeometry(96, 96)

    // Ground reflection for desktop devices.
    if (!isMobileOnly) {
      // Import reflector class.
      import('three/examples/jsm/objects/Reflector.js').then(({ Reflector }) => {
        let groundMirror = new Reflector(groundGeometry, {
          textureWidth: 2048,
          textureHeight: 2048,
        })
        groundMirror.position.y = -0.001
        groundMirror.rotateX(-Math.PI / 2)
        this.scene.add(groundMirror)
      })
    }

    let groundTexture = new THREE.TextureLoader().load('assets/images/ground/ground_tile.png')
    groundTexture.wrapS = THREE.RepeatWrapping
    groundTexture.wrapT = THREE.RepeatWrapping
    groundTexture.repeat.set(228, 228)
    groundTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()

    let groundMaterial = new THREE.MeshLambertMaterial({
      map: groundTexture,
      color: 0xaaaaaa,
      opacity: 0.8,
      transparent: true,
    })

    let ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = 0
    ground.receiveShadow = true
    this.scene.add(ground)

    // Set up vehicle
    this.vehicle = new THREE.Object3D()
    this.vehicleContainer = new THREE.Object3D()
    this.vehicleContainer.name = 'Vehicle'
    this.scene.add(this.vehicleContainer)

    // Set up addons.
    this.addons = new THREE.Object3D()
    this.addons.name = 'Addons'
    this.vehicleContainer.add(this.addons)

    // Set up wheel.
    this.wheels = new THREE.Object3D()
    this.wheels.name = 'Wheels'
    this.scene.add(this.wheels)

    this.rim = new THREE.Object3D()
    this.rim.name = 'Rim'

    this.tire = new THREE.Object3D()
    this.tire.name = 'Tire'

    this.wheel = new THREE.Object3D()
    this.wheel.add(this.rim)
    this.wheel.add(this.tire)

    this.wheelFL = this.wheel.clone()
    this.wheelFR = this.wheel.clone()
    this.wheelRL = this.wheel.clone()
    this.wheelRR = this.wheel.clone()

    this.wheelFL.name = 'FL'
    this.wheelFR.name = 'FR'
    this.wheelRL.name = 'RL'
    this.wheelRR.name = 'RR'

    this.wheels.add(this.wheelFL)
    this.wheels.add(this.wheelFR)
    this.wheels.add(this.wheelRL)
    this.wheels.add(this.wheelRR)

    // Initialize gltf loader.
    this.loader = new GLTFLoader()

    // Add Draco loader for compression.
    this.DRACOLoader = new DRACOLoader()
    this.DRACOLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
    this.DRACOLoader.preload()
    this.loader.setDRACOLoader(this.DRACOLoader)
  }

  // Animation loop.
  startAnimationLoop = () => {
    window.requestAnimationFrame(this.startAnimationLoop)

    // Update camera controls.
    this.cameraControls.update()

    // Auto rotate camera.
    if (this.props.cameraAutoRotate) {
      let cameraSpeed = 0.001

      let x = this.camera.position.x
      let z = this.camera.position.z
      this.camera.position.x = x * Math.cos(cameraSpeed) + z * Math.sin(cameraSpeed)
      this.camera.position.z = z * Math.cos(cameraSpeed) - x * Math.sin(cameraSpeed)
    }
    this.camera.lookAt(new THREE.Vector3(0, 0.75, 0))

    // Update TWEEN.
    TWEEN.update()

    // Render scene.
    this.renderer.render(this.scene, this.camera)
  }

  // Handle window resizing.
  handleWindowResize = () => {
    // Set size and aspect.
    this.camera.aspect = this.mount.offsetWidth / this.mount.offsetHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.mount.offsetWidth, this.mount.offsetHeight)
  }

  // Load vehicle.
  loadVehicle = () => {
    // Load vehicle model.
    this.loader.load(vehicleConfigs.vehicles[this.props.vehicle.id].model, (vehicleModel) => {
      // Remove existing vehicle.
      if (typeof this.vehicle !== 'undefined') {
        this.vehicleContainer.remove(this.vehicle)
      }

      // Create object.
      this.vehicle = vehicleModel.scene
      this.vehicle.name = vehicleConfigs.vehicles[this.props.vehicle.id].name

      // Set height.
      let height = this.getVehiclePosY()
      this.vehicleContainer.position.y = height + 0.1 // add a little extra for a 'drop in' effect.
      this.setVehiclePosY()

      // Update shadows & materials.
      this.setObjectColor(this.vehicle)

      // Set wheel position.
      this.setWheelPos()

      // Add vehicle to scene.
      this.vehicleContainer.add(this.vehicle)
    })
  }

  // Load rims.
  loadRims = () => {
    // Load rim model.
    this.loader.load(vehicleConfigs.wheels.rims[this.props.vehicle.rim].model, (rimModel) => {
      // Set rim object.
      this.rim = rimModel.scene.children[0].clone()
      this.rim.name = vehicleConfigs.wheels.rims[this.props.vehicle.rim].name
      // Loop through existing wheels.
      for (let i = 0; i < this.wheels.children.length; i++) {
        // Get rim container.
        let rimContainer = this.wheels.children[i].getObjectByName('Rim')

        // Remove old rim.
        rimContainer.remove(...rimContainer.children)

        // Add new instance.
        rimContainer.add(this.rim.clone())
      }

      // Update rim size.
      this.setRimSize()

      // Set rim color.
      this.setObjectColor(this.rim)
    })
  }

  // Load tires.
  loadTires = () => {
    // Load tire model.
    this.loader.load(vehicleConfigs.wheels.tires[this.props.vehicle.tire].model, (tireModel) => {
      // Set tire object.
      this.tire = tireModel.scene.children[0].clone()
      this.tire.name = vehicleConfigs.wheels.tires[this.props.vehicle.tire].name

      // Loop through existing wheels.
      for (let i = 0; i < this.wheels.children.length; i++) {
        // Get tire container.
        let tireContainer = this.wheels.children[i].getObjectByName('Tire')

        // Remove old tire.
        tireContainer.remove(...tireContainer.children)

        // Add new instance.
        tireContainer.add(this.tire.clone())
      }

      // Traverse children.
      this.tire.traverse(function (child) {
        if (child instanceof THREE.Mesh) {
          // Cast shadows.
          child.castShadow = true
          // Clone original geometry.
          child.origGeometry = child.geometry.clone()
        }
      })

      // Set tire size.
      this.setTireSize()

      // Update vehicle height.
      this.setVehiclePosY()

      // Set tire color.
      this.setObjectColor(this.tire)
    })
  }

  // Get wheel (axle) height.
  getWheelPosY = () => {
    let posY = (this.props.vehicle.tire_diameter * 2.54) / 100 / 2
    return posY
  }

  // Get vehicle height
  getVehiclePosY = () => {
    let axle_height = this.getWheelPosY()
    let liftInches = typeof this.props.vehicle.lift !== 'undefined' ? this.props.vehicle.lift : 0
    let posY = axle_height + (liftInches * 2.54) / 100 // adding lift height converted to meters.
    return posY
  }

  // Set vehicle height.
  setVehiclePosY = () => {
    if (typeof this.vehicle !== 'undefined') {
      let posY = this.getVehiclePosY()
      new TWEEN.Tween(this.vehicleContainer.position).to({ y: posY }, 1000).easing(TWEEN.Easing.Elastic.Out).start()
    }
  }

  // Set wheel position.
  setWheelPos = () => {
    // Wheel variables.
    let offset = vehicleConfigs.vehicles[this.props.vehicle.id]['wheel_offset'] + parseFloat(this.props.vehicle.wheel_offset)
    let wheelbase = vehicleConfigs.vehicles[this.props.vehicle.id]['wheelbase']

    let rotation = (Math.PI * 90) / 180
    let steering = (Math.PI * -10) / 180
    let height = this.getWheelPosY()

    // FL
    this.wheelFL.rotation.set(0, rotation + steering, 0)
    this.wheelFL.position.set(offset, height, wheelbase / 2)

    // FR
    this.wheelFR.rotation.set(0, -rotation + steering, 0)
    this.wheelFR.position.set(-offset, height, wheelbase / 2)

    // RL
    this.wheelRL.rotation.set(0, rotation, 0)
    this.wheelRL.position.set(offset, height, -wheelbase / 2)

    // RR
    this.wheelRR.rotation.set(0, -rotation, 0)
    this.wheelRR.position.set(-offset, height, -wheelbase / 2)
  }

  // Set wheel size.
  setWheelSize = () => {
    this.setRimSize()
    this.setTireSize()
  }

  // Set rim size.
  setRimSize = () => {
    // determine rim scale as a percentage of diameter.
    let od = (this.props.vehicle.rim_diameter * 2.54) / 100
    let od_scale = (od + 0.03175) / vehicleConfigs.wheels.rims[this.props.vehicle.rim].od

    let width = (this.props.vehicle.rim_width * 2.54) / 100
    let width_scale = width / vehicleConfigs.wheels.rims[this.props.vehicle.rim].width

    // Loop through wheels.
    for (let i = 0; i < this.wheels.children.length; i++) {
      // Get rim container.
      let rimContainer = this.wheels.children[i].getObjectByName('Rim')
      rimContainer.scale.set(od_scale, od_scale, width_scale)
    }
  }

  // Set tire size.
  setTireSize = () => {
    // Determine y scale as a percentage of width.
    let wheel_width = (this.props.vehicle.rim_width * 2.54) / 100
    let wheel_width_scale = wheel_width / vehicleConfigs.wheels.tires[this.props.vehicle.tire].width

    let od = vehicleConfigs.wheels.tires[this.props.vehicle.tire].od / 2
    let id = vehicleConfigs.wheels.tires[this.props.vehicle.tire].id / 2

    let newOd = (this.props.vehicle.tire_diameter * 2.54) / 10 / 2
    let newId = (this.props.vehicle.rim_diameter * 2.54) / 10 / 2

    // Traverse tire.
    this.tire.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Reset geometry.
        child.geometry.copy(child.origGeometry)

        // Scale to match wheel.
        child.geometry.scale(1, 1, wheel_width_scale)

        // Loop through vertices.
        for (var i = 0, l = child.geometry.attributes.position.count; i < l; i++) {
          // Start vector.
          let startVector = new THREE.Vector3().fromBufferAttribute(child.geometry.getAttribute('position'), i)

          // Center vector.
          let centerVector = new THREE.Vector3(0, 0, startVector.z)

          // Distance from center.
          let centerDist = centerVector.distanceTo(startVector)

          // Distance from rim.
          let rimDist = centerDist - id

          // Percentage from rim.
          let percentOut = rimDist / (od - id)

          // New distance from center.
          let newRimDist = (percentOut * (newOd - newId) + newId) / 10

          // End vector.
          let setVector = this.linePoint(centerVector, startVector, newRimDist)

          // Set x,y
          child.geometry.attributes.position.setX(i, setVector.x)
          child.geometry.attributes.position.setY(i, setVector.y)
        }

        // Update geometry.
        child.geometry.attributes.position.needsUpdate = true

        // Update vehicle height.
        this.setVehiclePosY()

        // Update wheel position.
        this.setWheelPos()
      }
    })
  }

  // Load vehicle addon.
  loadVehicleAddon = (addon_name) => {
    // Remove old addon.
    let old_addon = this.addons.getObjectByName(addon_name)
    this.addons.remove(old_addon)
    // Get new addon selection.
    let addon_selection = this.props.vehicle.addons[addon_name]

    if (addon_selection) {
      // Load new addon.
      this.loader.load(vehicleConfigs.vehicles[this.props.vehicle.id]['addons'][addon_name]['options'][addon_selection]['model'], (addonModel) => {
        // Create object.
        let addon = addonModel.scene
        addon.name = addon_name
        // Add to vehicle.
        this.addons.add(addon)
        // Update colors.
        this.setObjectColor(addon)
      })
    }
  }

  // Set object color.
  setObjectColor = (object) => {
    // Traverse object.
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Cast shadows from mesh.
        child.castShadow = true

        // Multiple materials.
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => this.setMaterials(material))
        }
        // Single material.
        else {
          this.setMaterials(child.material)
        }
      }
    })
  }

  // Update materials.
  setMaterials = (material) => {
    // Switch materials.
    switch (material.name) {
      // Body paint.
      case 'body':
        material.envMap = this.envMap
        material.color.setStyle(this.props.vehicle.color)
        material.metalness = 0.4
        material.roughness = this.props.vehicle.roughness
        break
      case 'chrome':
      case 'mirror':
        material.envMap = this.envMap
        material.metalness = 1
        material.roughness = 0
        material.color.set(new THREE.Color(1, 1, 1))
        break
      case 'glass':
        material.envMap = this.envMap
        material.transparent = true
        material.metalness = 1
        material.roughness = 0
        material.opacity = 0.2
        material.color.set(new THREE.Color(0.8, 0.8, 0.8))
        break
      case 'glass_tint':
        material.envMap = this.envMap
        material.transparent = true
        material.metalness = 1
        material.roughness = 0
        material.opacity = 0.4
        material.color.set(new THREE.Color(0.6, 0.6, 0.6))
        break
      case 'glass_dark':
        material.envMap = this.envMap
        material.transparent = true
        material.metalness = 1
        material.roughness = 0
        material.opacity = 0.8
        material.color.set(new THREE.Color(0.2, 0.2, 0.2))
        break
      case 'rim':
        this.setRimColor(material)
        break
      case 'rim_secondary':
        this.setRimColor(material, 'secondary')
        break
      case 'rubber':
        material.metalness = 0.6
        material.roughness = 0.8
        material.flatShading = true
        material.color.set(new THREE.Color(0.2, 0.2, 0.2))
        break
      case 'black':
        material.metalness = 0
        material.roughness = 0.5
        material.color.set(new THREE.Color(0.1, 0.1, 0.1))
        break
      default:
    }
  }

  setRimColor(material, type = 'primary') {
    let silver = new THREE.Color(0.8, 0.8, 0.8)
    let white = new THREE.Color(1, 1, 1)
    let black = new THREE.Color(0.1, 0.1, 0.1)

    material.envMap = this.envMap

    let color = type === 'secondary' ? this.props.vehicle.rim_color_secondary : this.props.vehicle.rim_color

    switch (color) {
      case 'silver':
        material.metalness = 0.6
        material.roughness = 0.2
        material.color.set(silver)
        break
      case 'chrome':
        material.metalness = 0.8
        material.roughness = 0
        material.color.set(white)
        break
      case 'gloss_black':
        material.metalness = 0.4
        material.roughness = 0
        material.color.set(black)
        break
      case 'flat_black':
        material.metalness = 0.2
        material.roughness = 1
        material.color.set(black)
        break
      case 'body':
        material.metalness = 0.4
        material.roughness = this.props.vehicle.roughness
        material.color.setStyle(this.props.vehicle.color)
        break
      default:
    }
  }

  // Calculate point on line (a to b, at length).
  linePoint = (a, b, length) => {
    let dir = b.clone().sub(a).normalize().multiplyScalar(length)
    return a.clone().add(dir)
  }

  // Recursively merge objects.
  MergeRecursive = (obj1, obj2) => {
    for (let p in obj2) {
      try {
        // Property in destination object set; update its value.
        if (obj2[p].constructor === Object) {
          obj1[p] = this.MergeRecursive(obj1[p], obj2[p])
        } else {
          obj1[p] = obj2[p]
        }
      } catch (e) {
        // Property in destination object not set; create it and set its value.
        obj1[p] = obj2[p]
      }
    }
    return obj1
  }

  // Take screenshot.
  takeScreenshot = () => {
    // Fixed render size.
    this.camera.aspect = 1280 / 720
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(1280, 720)

    this.renderer.render(this.scene, this.camera)

    // Download image.
    var link = document.createElement('a')
    link.download = 'filename.png'
    link.href = this.renderer.domElement.toDataURL('image/png')
    link.click()

    // Restore canvas size.
    this.handleWindowResize()
  }

  render() {
    return (
      <div id="vehicle" ref={(ref) => (this.mount = ref)}>
        {this.state.loading && <Loader loadingMessage={this.state.loadingMessage} />}
        <div id="actions">
          <button id="screenshot-button" onClick={this.takeScreenshot}>
            Screenshot
          </button>
          <button id="save-button" onClick={this.props.saveVehicle}>
            Save
          </button>
        </div>
      </div>
    )
  }
}

export default VehicleCanvas
