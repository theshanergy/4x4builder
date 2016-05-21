// todo:
// dat.gui or alternate ui
// current.config to/from db
// animate only on change / reduce cpu usage


// Set up global variables.
var scene, camera, renderer, light,
vehicle, wheels = {};
var cameraRotSpeed = 0.001;

// Collada loader.
var loader = new THREE.ColladaLoader();

window.onload = function() {
  // Init scene.
  init();
  // Animate scene.
  animate();
};

// Add scene to inspector.
window.scene = scene;

// Initialization function.
function init() {
  // Get configurator div.
  container = document.getElementById('configurator');

  // Container dimensions.
  var containerWidth = window.innerWidth,
      containerHeight = window.innerHeight;

  // Create scene.
  scene = new THREE.Scene;

  // Create renderer and set size.
  renderer = new THREE.WebGLRenderer({antialias:true, alpha: true});
  renderer.setSize(containerWidth, containerHeight);
  renderer.shadowMap.enabled = true;

  // Add renderer to DOM.
  container.appendChild(renderer.domElement);

  // Add camera.
  camera = new THREE.PerspectiveCamera(24, containerWidth / containerHeight, .1, 500);
  camera.position.x = 5; //
  camera.position.y = 2; // height
  camera.position.z = 5;
  scene.add(camera);

  // Camera controls.
  cameraControls = new THREE.OrbitControls(camera, renderer.domElement);
  cameraControls.maxPolarAngle = Math.PI/2 - 0.05;

  // lights
  scene.add(new THREE.AmbientLight(0xffffff));
  light = new THREE.DirectionalLight(0xffffff, 0.5);
  light.position.set(0, 20, 0);
  light.castShadow = true;
  light.shadow.mapSize.width = 256;
  light.shadow.mapSize.height = 256;
  var d = 3;
  light.shadow.camera.left = -d;
  light.shadow.camera.right = d;
  light.shadow.camera.top = d;
  light.shadow.camera.bottom = -d;
  light.shadow.camera.far = 50;
  scene.add(light);

  // Environment map.
  var envMapURL = 'assets/images/envmap/envmap.jpg';
  var envMapURLS = [envMapURL, envMapURL, envMapURL, envMapURL, envMapURL, envMapURL];
  textureCube = new THREE.CubeTextureLoader().load(envMapURLS);
  textureCube.mapping = THREE.CubeReflectionMapping;

  // Load vehicle.
  loadVehicle();

  // Load ground.
  loadGround();
}

// Animate.
function animate() {
  requestAnimationFrame(animate);
  render();
};

// Render scene.
function render() {
  // Update camera controls.
  cameraControls.update();
  // Auto rotate camera.
  var x = camera.position.x;
  var z = camera.position.z;
  camera.position.x = x * Math.cos(cameraRotSpeed) + z * Math.sin(cameraRotSpeed);
  camera.position.z = z * Math.cos(cameraRotSpeed) - x * Math.sin(cameraRotSpeed);
  camera.lookAt(new THREE.Vector3(0, 0.75, 0));
  // Update TWEEN.
  TWEEN.update();
  // Render scene.
  renderer.render(scene, camera);
};

// Load vehicle.
function loadVehicle() {
  var vehicle_name = config.current.vehicle.id;
  loader.load(config.vehicles[vehicle_name]['model'], function(vehicleModel) {
    // Remove existing vehicle.
    if (typeof vehicle !== 'undefined') {
      scene.remove(vehicle);
    }
    // Create object.
    vehicle = vehicleModel.scene;
    // Set name.
    vehicle.name = vehicle_name;
    // Update shadows & materials.
    setVehicleColor();
    // Set height
    setVehicleHeight();
    // Refresh wheels.
    loadWheels();
    // Add vehicle to scene.
    scene.add(vehicle);
    // Add addons
    loadVehicleAddons();
    // Tween bounce in.
    var start_position = vehicle.position;
    vehicle.position.y += 0.25;
    new TWEEN.Tween(vehicle.position).to(start_position, 1000).easing(TWEEN.Easing.Elastic.Out).start();
  });
}

// Load wheels.
function loadWheels() {
  // Load new wheel.
  loader.load(config.wheels[config.current.wheel.id]['model'], function(wheelModel) {
    // Remove existing wheels.
    if (typeof wheels !== 'undefined') {
      scene.remove(wheels);
    }
    // Create object.
    var wheel = wheelModel.scene;
    // Traverse children.
    wheel.traverse(function(child) {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
      }
    });
    // Wheel variables.
    var axle_height = config.wheels[config.current.wheel.id]['diameter'] / 2;
    var wheel_offset = config.vehicles[config.current.vehicle.id]['wheel_offset'];
    var axle_front = config.vehicles[config.current.vehicle.id]['axle_front'];
    var axle_rear = config.vehicles[config.current.vehicle.id]['axle_rear'];
    var wheelRot = Math.PI * 90 / 180;
    var wheelSteer = Math.PI * -10 / 180;
    // Create wheels object.
    wheels = new THREE.Object3D();
    // Build wheel instances.
    for (var i = 0; i < 4; i++) {
      // Clone wheel.
      var newWheel = wheel.clone();
      // Set wheel positioning.
      switch(i) {
        // FR
        case 0:
          newWheel.rotateZ(wheelRot + wheelSteer);
          newWheel.position.set(wheel_offset, axle_height, axle_front);
          break;
        // FL
        case 1:
          newWheel.rotateZ(-wheelRot + wheelSteer);
          newWheel.position.set(-wheel_offset, axle_height, axle_front);
          break;
        // RR
        case 2:
          newWheel.rotateZ(wheelRot);
          newWheel.position.set(wheel_offset, axle_height, axle_rear);
          break;
        // RL
        case 3:
          newWheel.rotateZ(-wheelRot);
          newWheel.position.set(-wheel_offset, axle_height, axle_rear);
          break;
      }
      // Add wheel to wheels object.
      wheels.add(newWheel);
    }
    // Add wheels to scene.
    scene.add(wheels);
    // Update vehicle height.
    if (typeof vehicle !== 'undefined') {
      setVehicleHeight();
    }
  });
}

// Load vehicle addons.
function loadVehicleAddons() {
  var addons = config.current.vehicle.addons;
  for (var addon in addons) {
    // skip loop if the property is from prototype
    if (!addons.hasOwnProperty(addon)) continue;
    // Load addon.
    loadVehicleAddon(addon);
  }
}

// Load vehicle addon..
function loadVehicleAddon(addon_name) {
  // Remove old addon.
  var old_addon = vehicle.getObjectByName(addon_name);
  vehicle.remove(old_addon);
  // Get new addon selection.
  var addon_selection = config.current.vehicle.addons[addon_name];
  // Load new addon.
  loader.load(config.vehicles[vehicle.name]['addons'][addon_name]['options'][addon_selection]['model'], function(addonModel) {
    // Create object.
    addon = addonModel.scene;
    addon.name = addon_name;
    addon.rotation.x = 0;
    // Add to vehicle.
    vehicle.add(addon);
    // Update colors.
    setVehicleColor();
  });
}

// Set vehicle height.
function setVehicleHeight() {
  // Apply lift.
  var axle_height = config.wheels[config.current.wheel.id]['diameter'] / 2;
  var lift = axle_height + (config.current.vehicle.lift * 2.54) / 100;
  new TWEEN.Tween(vehicle.position).to({y: lift}, 1000).easing(TWEEN.Easing.Elastic.Out).start();
}

// Set vehicle color.
function setVehicleColor() {
  // Traverse object
  vehicle.traverse(function (child) {
    // Cast shadows from mesh.
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      // Set material.
      if (child.material.type === 'MeshPhongMaterial') {
        setMaterials(child.material);
      }
    }
  });
}

// Update materials.
function setMaterials(material) {
  // Switch materials.
  switch (material.name) {
    // Body paint.
    case 'body':
      material.envMap = textureCube;
      material.reflectivity = 0.5;
      material.color.setStyle(config.current.vehicle.color);
      break;
    case 'tint_light':
    case 'tint_dark':
    case 'glass_clear':
      material.envMap = textureCube;
      break;
  }
}

// Load ground.
function loadGround() {
  var transparentmaterial = new THREE.ShadowMaterial();
  transparentmaterial.opacity = 0.5;
  var ground = new THREE.Mesh(new THREE.PlaneBufferGeometry(10, 10), transparentmaterial);
  ground.rotation.x = -Math.PI/2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);
}
