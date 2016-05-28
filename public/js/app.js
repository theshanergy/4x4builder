// todo:
// current.config to/from db
// animate only on change / reduce cpu usage
// browserify / require js
// dynamic tire sizing
// vioffroad decals





// Set up global variables.
var scene, camera, renderer, light,
vehicle, wheels, wheelFR, wheelFL, wheelRR, wheelRL, tire = {};

// Collada loader.
var loader = new THREE.ColladaLoader();

// Initialization function.
function init() {

  // Create scene.
  scene = new THREE.Scene;

  // Create renderer and set size.
  renderer = new THREE.WebGLRenderer({antialias:true, alpha: true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  // Add renderer to DOM.
  container = document.createElement('div');
  document.body.appendChild(container);
  container.appendChild(renderer.domElement);

  // Add camera.
  camera = new THREE.PerspectiveCamera(24, window.innerWidth / window.innerHeight, .1, 500);
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

  // Load gui.
  gui();

  // Bind window resize event
  window.addEventListener('resize', windowResize, false);
};

// Window resize.
function windowResize() {
  // Set size and aspect.
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// GUI.
function gui() {
  // // Add dat.gui
  var gui = new dat.GUI();

  // Vehicle folder.
  var guiVehicle = gui.addFolder('Vehicle');
  guiVehicle.open();

  // Build vehicle options.
  var vehicleOptions = {};
  for (var vehicleKey in config.vehicles) {
    vehicleOptions[config.vehicles[vehicleKey].name] = vehicleKey;
  }
  // Vehicle selection.
  guiVehicle.add(current.vehicle, 'id', vehicleOptions).name('Vehicle').onChange(function(value){
    loadVehicle();
  });

  // Vehicle Color.
  guiVehicle.addColor(current.vehicle, 'color').name('Color').onChange(function(value){
    setVehicleColor();
  });

  // Lift.
  guiVehicle.add(current.vehicle, 'lift', -2, 8).step(1).name('Lift').onChange(function(value){
    setVehicleHeight();
  });

  // Wheels folder.
  var guiWheels = gui.addFolder('Wheels');

  // Build wheel options.
  var wheelOptions = {};
  for (var wheelKey in config.wheels.rims) {
    wheelOptions[config.wheels.rims[wheelKey].name] = wheelKey;
  }
  // Wheel selection.
  guiWheels.add(current.wheels, 'rim', wheelOptions).name('Wheel').onFinishChange(function(value){
    loadWheels();
  });

  // Wheel Size.
  guiWheels.add(current.wheels, 'rim_size', 14, 20).step(1).name('Wheel Size').onFinishChange(function(value){
    setWheelSize();
    setTireSize();
  });

  // Build tire options.
  var tireOptions = {};
  for (var tireKey in config.wheels.tires) {
    tireOptions[config.wheels.tires[tireKey].name] = tireKey;
  }
  // Tire selection.
  guiWheels.add(current.wheels, 'tire', tireOptions).name('Tire').onFinishChange(function(value){
    loadTires();
  });

  // Tire Size.
  guiWheels.add(current.wheels, 'tire_size', 30, 40).step(1).name('Tire Size').onFinishChange(function(value){
    setWheelSize();
    setTireSize();
  });


  // Addons.
  var guiAddons = gui.addFolder('Addons');
  // Loop through addons
  for (var addonKey in config.vehicles[current.vehicle.id].addons) {
    var addonOptions = {};
    // Loop through addon options
    for (var optionKey in config.vehicles[current.vehicle.id].addons[addonKey].options) {
      addonOptions[config.vehicles[current.vehicle.id].addons[addonKey].options[optionKey].name] = optionKey;
    }
    // Add field
    guiAddons.add(current.vehicle.addons, addonKey, addonOptions)
             .name(config.vehicles[current.vehicle.id].addons[addonKey].name)
             .onChange(function() {
                console.log(this);
                loadVehicleAddon(this.property);
             });
  }

  // Scene folder
  var guiCamera = gui.addFolder('Scene');
  guiCamera.add(current.camera, 'auto').name('Auto Rotate');
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
  if (current.camera.auto) {
    var x = camera.position.x;
    var z = camera.position.z;
    camera.position.x = x * Math.cos(current.camera.speed) + z * Math.sin(current.camera.speed);
    camera.position.z = z * Math.cos(current.camera.speed) - x * Math.sin(current.camera.speed);
  }
  camera.lookAt(new THREE.Vector3(0, 0.75, 0));
  // Update TWEEN.
  TWEEN.update();
  // Render scene.
  renderer.render(scene, camera);
};

// Load vehicle.
function loadVehicle() {
  var vehicle_name = current.vehicle.id;
  loader.load(config.vehicles[vehicle_name]['model'], function(vehicleModel) {
    // Remove existing vehicle.
    if (typeof vehicle !== 'undefined') {
      scene.remove(vehicle);
    }
    // Create object.
    vehicle = vehicleModel.scene;
    // Set name.
    vehicle.name = vehicle_name;
    // Set height.
    var height = getVehicleHeight();
    vehicle.position.y = height + 0.1; // add a little extra for a 'drop in' effect.
    // Update shadows & materials.
    setVehicleColor();
    // Load wheels.
    loadWheels();
    // Load tires.
    loadTires();
    // Add vehicle to scene.
    scene.add(vehicle);
    // Add addons
    loadVehicleAddons();
  });
}

// Load wheels.
function loadWheels() {
  // Load new wheel.
  loader.load(config.wheels.rims[current.wheels.rim].model, function(wheelModel) {
    // Remove existing wheels.
    if (typeof wheels !== 'undefined') {
      scene.remove(wheels);
    }
    // Create object.
    wheel = wheelModel.scene;
    // Traverse children.
    wheel.traverse(function(child) {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
      }
    });
    // Wheel variables.
    var wheel_height = getWheelHeight();
    var wheel_offset = config.vehicles[current.vehicle.id]['wheel_offset'];
    var axle_front = config.vehicles[current.vehicle.id]['axle_front'];
    var axle_rear = config.vehicles[current.vehicle.id]['axle_rear'];
    var wheelRot = Math.PI * 90 / 180;
    var wheelSteer = Math.PI * -10 / 180;
    // Create wheels object.
    wheels = new THREE.Object3D();

    // FR
    wheelFR = wheel.clone();
    wheelFR.rotateZ(wheelRot + wheelSteer);
    wheelFR.position.set(wheel_offset, 0, axle_front);
    wheels.add(wheelFR);
    // FL
    wheelFL = wheel.clone();
    wheelFL.rotateZ(-wheelRot + wheelSteer);
    wheelFL.position.set(-wheel_offset, 0, axle_front);
    wheels.add(wheelFL);
    // RR
    wheelRR = wheel.clone();
    wheelRR.rotateZ(wheelRot);
    wheelRR.position.set(wheel_offset, 0, axle_rear);
    wheels.add(wheelRR);
    // RL
    wheelRL = wheel.clone();
    wheelRL.rotateZ(-wheelRot);
    wheelRL.position.set(-wheel_offset, 0, axle_rear);
    wheels.add(wheelRL);

    // Set wheel height.
    wheels.position.set(0, wheel_height, 0);

    // Add wheels to scene.
    scene.add(wheels);

    // Update wheel size
    setWheelSize();
  });
}

// Load tires.
function loadTires() {
  // Load new tire.
  loader.load(config.wheels.tires[current.wheels.tire].model, function(tireModel) {
    // Remove existing tires.
    if (typeof tires !== 'undefined') {
      scene.remove(tires);
    }
    // Create object.
    tire = tireModel.scene;
    // Traverse children.
    tire.traverse(function(child) {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;

        //
        child.origGeometry = child.geometry.clone();
      }
    });
    // Wheel variables.
    var wheel_height = getWheelHeight();
    var wheel_offset = config.vehicles[current.vehicle.id]['wheel_offset'];
    var axle_front = config.vehicles[current.vehicle.id]['axle_front'];
    var axle_rear = config.vehicles[current.vehicle.id]['axle_rear'];
    var wheelRot = Math.PI * 90 / 180;
    var wheelSteer = Math.PI * -10 / 180;
    // Create tires object.
    tires = new THREE.Object3D();

    // FR
    tireFR = tire.clone();
    tireFR.rotateZ(wheelRot + wheelSteer);
    tireFR.position.set(wheel_offset, 0, axle_front);
    tires.add(tireFR);
    // FL
    tireFL = tire.clone();
    tireFL.rotateZ(-wheelRot + wheelSteer);
    tireFL.position.set(-wheel_offset, 0, axle_front);
    tires.add(tireFL);
    // RR
    tireRR = tire.clone();
    tireRR.rotateZ(wheelRot);
    tireRR.position.set(wheel_offset, 0, axle_rear);
    tires.add(tireRR);
    // RL
    tireRL = tire.clone();
    tireRL.rotateZ(-wheelRot);
    tireRL.position.set(-wheel_offset, 0, axle_rear);
    tires.add(tireRL);

    // initial height
    tires.position.set(0, wheel_height, 0);

    // Add wheels to scene.
    scene.add(tires);
    // Set size.
    setTireSize();
    // Update vehicle height.
    if (typeof vehicle !== 'undefined') {
      setVehicleHeight();
    }
  });
}

// Set wheel size.
function setWheelSize() {
  // determine wheel scale as a percentage of diameter
  var wheel_od_new = (current.wheels.rim_size * 2.54) / 100;
  var wheel_scale = (wheel_od_new + 0.03175) / config.wheels.rims[current.wheels.rim].od;

  wheelFR.scale.setX(wheel_scale);
  wheelFR.scale.setZ(wheel_scale);

  wheelFL.scale.setX(wheel_scale);
  wheelFL.scale.setZ(wheel_scale);

  wheelRR.scale.setX(wheel_scale);
  wheelRR.scale.setZ(wheel_scale);

  wheelRL.scale.setX(wheel_scale);
  wheelRL.scale.setZ(wheel_scale);
};


// Set wheel size.
function setTireSize() {
  // determine wheel scale as a percentage of diameter
  var wheel_od_new = (current.wheels.rim_size * 2.54) / 100;
  var wheel_scale = (wheel_od_new + 0.03175) / config.wheels.rims[current.wheels.rim].od;

  var od = config.wheels.tires[current.wheels.tire].od / 2;
  var id = config.wheels.tires[current.wheels.tire].id / 2;

  var newOd = ((current.wheels.tire_size * 2.54) / 10) / 2;
  var newId = ((current.wheels.rim_size * 2.54) / 10) / 2;

  // traverse tire
  tire.traverse(function (child) {
    if (child instanceof THREE.Mesh) {

      // scale to match wheel.
      child.geometry.scale(wheel_scale, 1, wheel_scale);

      // reset geometry.
      child.geometry.copy(child.origGeometry);

      // loop through vertices.
      for ( var i = 0, l = child.geometry.attributes.position.array.length; i < l; i ++ ) {
        if (child.geometry.attributes.position.array.hasOwnProperty(i)) {

          // start vector.
          var startVector = (new THREE.Vector3()).fromAttribute(child.geometry.getAttribute('position'), i);

          // center vector.
          var centerVector = new THREE.Vector3(0, startVector.y, 0);

          // distance from center.
          var centerDist = centerVector.distanceTo(startVector);

          // distance from rim.
          var rimDist = centerDist - id;

          // percentage from rim.
          var percentOut = rimDist / (od - id);

          // new distance from center.
          var newRimDist = (percentOut * (newOd - newId) + newId) / 10;

          // end vector.
          var setVector = linePoint(centerVector, startVector, newRimDist);

          // set x,y
          child.geometry.attributes.position.setX(i, setVector.x);
          child.geometry.attributes.position.setZ(i, setVector.z);
        }
      }
      // Update geometry.
      child.geometry.attributes.position.needsUpdate = true;
      // Update vehicle height.
      setVehicleHeight();
      // Update wheel height.
      setWheelHeight();
    }
  });
}

// Calculate point on line (a to b, at length).
function linePoint(a, b, length) {
  var dir = b.clone().sub(a).normalize().multiplyScalar(length);
  return a.clone().add(dir);
}

// Load vehicle addons.
function loadVehicleAddons() {
  var addons = current.vehicle.addons;
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
  var addon_selection = current.vehicle.addons[addon_name];
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

// Get wheel (axle) height.
function getWheelHeight() {
  var height = ((current.wheels.tire_size * 2.54) / 100) / 2;
  return height;
}

// Set wheel height.
function setWheelHeight() {
  var height = getWheelHeight();
  wheels.position.set(0, height, 0);
  tires.position.set(0, height, 0);
}

// Get vehicle height
function getVehicleHeight() {
  var axle_height = getWheelHeight();
  var liftInches = typeof current.vehicle.lift !== 'undefined' ? current.vehicle.lift : 0;
  var height = axle_height + (liftInches * 2.54) / 100; // adding lift height converted to meters.
  return height;
}

// Set vehicle height.
function setVehicleHeight() {
  var height = getVehicleHeight();
  new TWEEN.Tween(vehicle.position).to({y: height}, 1000).easing(TWEEN.Easing.Elastic.Out).start();
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
      material.color.setStyle(current.vehicle.color);
      break;
    case 'chrome':
      material.envMap = textureCube;
      material.color.set(new THREE.Color(1, 1, 1));
      material.specular.set(new THREE.Color(1, 1, 1));
      material.reflectivity = 0.9;
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

// Init scene.
init();
// Animate scene.
animate();

// Add scene to inspector.
window.scene = scene;
