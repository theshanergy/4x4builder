// todo:
// lights
// lightbars & accessories
// license plate
// optional addons
// spare tire (rear, roof)
// mobile interface
// axle width selector
// tire width selector
// animate only on change / reduce cpu usage
// browserify / require js
// decals (vioffroad, etc)


// Set up global variables.
var scene, camera, renderer, loader, light, envMap, gui, guiAddons, session, loading,
vehicle, rim, tire = {};
var rims = new THREE.Object3D();
var tires = new THREE.Object3D();


// Start loading manager.
loadingManager = new THREE.LoadingManager();
loadingManager.onProgress = function (item, loaded, total) {
  // loading progress.
};
loadingManager.onLoad = function () {
  hideLoader();
};
loadingManager.onError = function () {
  console.log('loading error');
};

// Show loader.
function showLoader() {
  document.getElementById('loader').style.display = 'table';
}

// Hide loader.
function hideLoader() {
  document.getElementById('loader').style.display = 'none';
}


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
  camera.position.x = 6; //
  camera.position.y = 2; // height
  camera.position.z = 6;
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
  envMap = new THREE.CubeTextureLoader().load(envMapURLS);
  envMap.mapping = THREE.CubeReflectionMapping;

  // Load ground.
  loadGround();

  // Get default vehicle addons
  current.vehicle.addons = config.vehicles[current.vehicle.id].default_addons;

  // Initialize collada loader.
  colladaLoader = new THREE.ColladaLoader(loadingManager);

  // Get session
  session = window.location.pathname.replace(/^\/([^\/]*).*$/, '$1');

  // Existing session.
  if(session) {
    // Get default config from db.
    firebase.database().ref('/configs/' + session).once('value').then(function(data) {
      // If exists.
      if(data.val() != null) {
        // Overwrite current from response.
        current = MergeRecursive(current, data.val());
        // Load vehicle.
        loadVehicle();
        // Load gui.
        loadGui();
      }
      else {
        session = randomString(16);
        // Load vehicle.
        loadVehicle();
        // Load gui.
        loadGui();
      }
    });
  }
  else {
    session = randomString(16);
    // Load vehicle.
    loadVehicle();
    // Load gui.
    loadGui();
  }

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
function loadGui() {

  // // Add dat.gui
  gui = new dat.GUI();

  // GUI actions.
  var guiActions = {
    // Save.
    'save': function() {
      // Store current config to db.
      firebase.database().ref('/configs/' + session).set(current);
      // push session string to url.
      window.history.pushState({}, 'Save', '/' + session);
      // Notify user.
      swal("Vehicle saved!", "Please copy or bookmark this page. Anyone with this URL may edit the vehicle.", "success")
    }
  };

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
    // Load vehicle.
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

  // Build rim options.
  var rimOptions = {};
  for (var rimKey in config.wheels.rims) {
    rimOptions[config.wheels.rims[rimKey].name] = rimKey;
  }
  // Rim selection.
  guiWheels.add(current.wheels, 'rim', rimOptions).name('Rims').onFinishChange(function(value){
    loadRims();
  });
  // Rim Color.
  guiWheels.add(current.wheels, 'rim_color', {'Chrome': 'chrome', 'Black': 'black', 'Silver': 'silver'}).name('Color').onFinishChange(function(value){
    setRimColor();
  });
  // Rim Size.
  guiWheels.add(current.wheels, 'rim_size', 14, 20).step(1).name('Rim Size').onFinishChange(function(value){
    setRimSize();
    setTireSize();
  });
  // Rim width.
  guiWheels.add(current.wheels, 'rim_width', 7, 16).step(1).name('Rim Width').onFinishChange(function(value){
    setRimSize();
    setTireSize();
  });

  // Build tire options.
  var tireOptions = {};
  for (var tireKey in config.wheels.tires) {
    tireOptions[config.wheels.tires[tireKey].name] = tireKey;
  }
  // Tire selection.
  guiWheels.add(current.wheels, 'tire', tireOptions).name('Tires').onFinishChange(function(value){
    loadTires();
  });
  // Tire Size.
  guiWheels.add(current.wheels, 'tire_size', 30, 40).step(1).name('Tire Size').onFinishChange(function(value){
    setRimSize();
    setTireSize();
  });

  // Addons.
  guiAddons = gui.addFolder('Addons');

  // Scene.
  var guiCamera = gui.addFolder('Scene');
  guiCamera.add(current.camera, 'auto').name('Auto Rotate');

  // Save.
  gui.add(guiActions, 'save').name('Save Vehicle');
}

// Update GUI.
function loadGuiAddons() {
  // Remove current addon fields.
  var addonCount = gui.__folders.Addons.__controllers.length;
  for (var i = 0; i < addonCount; i++) {
    gui.__folders.Addons.remove(gui.__folders.Addons.__controllers[0]);
  }

  // Loop through addons
  for (var addonKey in config.vehicles[current.vehicle.id].addons) {
    var addonOptions = {};
    // Loop through addon options
    for (var optionKey in config.vehicles[current.vehicle.id].addons[addonKey].options) {
      addonOptions[config.vehicles[current.vehicle.id].addons[addonKey].options[optionKey].name] = optionKey;
    }
    // Add field
    guiAddons
    .add(current.vehicle.addons, addonKey, addonOptions)
    .name(config.vehicles[current.vehicle.id].addons[addonKey].name)
    .onChange(function() {
      loadVehicleAddon(this.property);
    });
  }
}

// Random string generator.
function randomString(length) {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for(var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
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
  // Show loader.
  showLoader();
  // Load vehicle model.
  colladaLoader.load(config.vehicles[current.vehicle.id]['model'], function(vehicleModel) {
    // Remove existing vehicle.
    if (typeof vehicle !== 'undefined') {
      scene.remove(vehicle);
    }
    // Create object.
    vehicle = vehicleModel.scene;
    // Set name.
    // Set height.
    var height = getVehicleHeight();
    vehicle.position.y = height + 0.1; // add a little extra for a 'drop in' effect.
    // Update shadows & materials.
    setVehicleColor();
    // Load rims.
    loadRims();
    // Load tires.
    loadTires();
    // Add vehicle to scene.
    scene.add(vehicle);
    // Get default addons.
    current.vehicle.addons = config.vehicles[current.vehicle.id]['default_addons'];
    // Add addons
    loadVehicleAddons();
    // Update GUI.
    loadGuiAddons();
  });
}

// Load rims.
function loadRims() {
  // Show loader.
  showLoader();
  // Load rim model.
  colladaLoader.load(config.wheels.rims[current.wheels.rim].model, function(rimModel) {
    // Remove existing rims.
    for ( var i = rims.children.length - 1; i >= 0; i--) {
      if (rims.children.hasOwnProperty(i)) {
        rims.remove(rims.children[i]);
      }
    }

    // Create object.
    rim = rimModel.scene;

    // rim variables.
    var height = getWheelHeight();
    var offset = config.vehicles[current.vehicle.id]['wheel_offset'];
    var axleFront = config.vehicles[current.vehicle.id]['axle_front'];
    var axleRear = config.vehicles[current.vehicle.id]['axle_rear'];
    var wheelRot = Math.PI * 90 / 180;
    var wheelSteer = Math.PI * -10 / 180;

    // FR
    var rimFR = rim.clone();
    rimFR.rotateZ(wheelRot + wheelSteer);
    rimFR.position.set(offset, 0, axleFront);
    rims.add(rimFR);
    // FL
    var rimFL = rim.clone();
    rimFL.rotateZ(-wheelRot + wheelSteer);
    rimFL.position.set(-offset, 0, axleFront);
    rims.add(rimFL);
    // RR
    var rimRR = rim.clone();
    rimRR.rotateZ(wheelRot);
    rimRR.position.set(offset, 0, axleRear);
    rims.add(rimRR);
    // RL
    var rimRL = rim.clone();
    rimRL.rotateZ(-wheelRot);
    rimRL.position.set(-offset, 0, axleRear);
    rims.add(rimRL);
    // Spare
    var rimSpare = rim.clone();
    rimSpare.rotateZ(Math.PI);
    rimSpare.position.set(0, 0.7, -2.45);
    rims.add(rimSpare);

    // Set rim height.
    rims.position.set(0, height, 0);

    // Add rims to scene.
    scene.add(rims);

    // Update rim size
    setRimSize();

    // Set rim color
    setRimColor();
  });
}

// Load tires.
function loadTires() {
  // Show loader.
  showLoader();
  // Load tire model.
  colladaLoader.load(config.wheels.tires[current.wheels.tire].model, function(tireModel) {
    // Remove existing tires.
    for ( var i = tires.children.length - 1; i >= 0; i--) {
      if (tires.children.hasOwnProperty(i)) {
        tires.remove(tires.children[i]);
      }
    }

    // Create object.
    tire = tireModel.scene;

    // Traverse children.
    tire.traverse(function(child) {
      if (child instanceof THREE.Mesh) {
        // Cast shadows.
        child.castShadow = true;

        // Clone original geometry.
        child.origGeometry = child.geometry.clone();
      }
    });
    // Wheel variables.
    var height = getWheelHeight();
    var offset = config.vehicles[current.vehicle.id]['wheel_offset'];
    var axleFront = config.vehicles[current.vehicle.id]['axle_front'];
    var axleRear = config.vehicles[current.vehicle.id]['axle_rear'];
    var wheelRot = Math.PI * 90 / 180;
    var wheelSteer = Math.PI * -10 / 180;

    // FR
    var tireFR = tire.clone();
    tireFR.rotateZ(wheelRot + wheelSteer);
    tireFR.position.set(offset, 0, axleFront);
    tires.add(tireFR);
    // FL
    var tireFL = tire.clone();
    tireFL.rotateZ(-wheelRot + wheelSteer);
    tireFL.position.set(-offset, 0, axleFront);
    tires.add(tireFL);
    // RR
    var tireRR = tire.clone();
    tireRR.rotateZ(wheelRot);
    tireRR.position.set(offset, 0, axleRear);
    tires.add(tireRR);
    // RL
    var tireRL = tire.clone();
    tireRL.rotateZ(-wheelRot);
    tireRL.position.set(-offset, 0, axleRear);
    tires.add(tireRL);

    // Spare
    var tireSpare = tire.clone();
    tireSpare.rotateZ(Math.PI);
    tireSpare.position.set(0, 0.7, -2.45);
    tires.add(tireSpare);

    // initial height
    tires.position.set(0, height, 0);

    // Add tires to scene.
    scene.add(tires);
    // Set size.
    setTireSize();
    // Update vehicle height.
    if (typeof vehicle !== 'undefined') {
      setVehicleHeight();
    }
  });
}

// Set rim size.
function setRimSize() {
  // determine rim scale as a percentage of diameter
  var od = (current.wheels.rim_size * 2.54) / 100;
  var od_scale = (od + 0.03175) / config.wheels.rims[current.wheels.rim].od;

  var width = (current.wheels.rim_width * 2.54) / 100;
  var width_scale = width / config.wheels.rims[current.wheels.rim].width;

  // Loop through rims.
  for ( var i = 0; i < rims.children.length; i ++ ) {
    if (rims.children.hasOwnProperty(i)) {
      // Set scale.
      rims.children[i].scale.set(od_scale, width_scale, od_scale);
    }
  }
};


// Set tire size.
function setTireSize() {
  // determine y scale as a percentage of width
  var wheel_width = (current.wheels.rim_width * 2.54) / 100;
  var wheel_width_scale = wheel_width / config.wheels.tires[current.wheels.tire].width;

  var od = config.wheels.tires[current.wheels.tire].od / 2;
  var id = config.wheels.tires[current.wheels.tire].id / 2;

  var newOd = ((current.wheels.tire_size * 2.54) / 10) / 2;
  var newId = ((current.wheels.rim_size * 2.54) / 10) / 2;

  // traverse tire
  tire.traverse(function (child) {
    if (child instanceof THREE.Mesh) {

      // reset geometry.
      child.geometry.copy(child.origGeometry);

      // scale to match wheel.
      child.geometry.scale(1, wheel_width_scale, 1);

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
  // Show loader.
  showLoader();
  // Load new addon.
  colladaLoader.load(config.vehicles[current.vehicle.id]['addons'][addon_name]['options'][addon_selection]['model'], function(addonModel) {
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
  rims.position.set(0, height, 0);
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
    if (child instanceof THREE.Mesh) {
      // Cast shadows from mesh.
      child.castShadow = true;
      // Set material.
      if (child.material.type === 'MeshPhongMaterial') {
        setMaterials(child.material);
      }
    }
  });
}

// Set wheel color.
function setRimColor() {
  // Traverse object
  rim.traverse(function (child) {
    if (child instanceof THREE.Mesh) {
      // Cast shadows from mesh.
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
  var silver = new THREE.Color(0.8, 0.8, 0.8);
  var white = new THREE.Color(1, 1, 1);
  var black = new THREE.Color(0.2, 0.2, 0.2);
  // Switch materials.
  switch (material.name) {
    // Body paint.
    case 'body':
      material.envMap = envMap;
      material.reflectivity = 0.5;
      material.color.setStyle(current.vehicle.color);
      break;
    case 'chrome':
      material.envMap = envMap;
      material.color.set(white);
      material.specular.set(white);
      material.reflectivity = 0.9;
      break;
    case 'tint_light':
    case 'tint_dark':
    case 'glass_clear':
      material.envMap = envMap;
      break;
    case 'rim':
      material.envMap = envMap;
      material.reflectivity = 0.5;
      switch (current.wheels.rim_color) {
        case 'silver':
          material.color.set(silver);
          material.specular.set(silver);
          break;
        case 'chrome':
          material.envMap = envMap;
          material.color.set(white);
          material.specular.set(white);
          material.reflectivity = 0.9;
          break;
        default:
          material.color.set(black);
      }
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


// Recursively merge objects.
function MergeRecursive(obj1, obj2) {
  for (var p in obj2) {
    try {
      // Property in destination object set; update its value.
      if ( obj2[p].constructor == Object ) {
        obj1[p] = MergeRecursive(obj1[p], obj2[p]);
      } else {
        obj1[p] = obj2[p];
      }
    } catch(e) {
      // Property in destination object not set; create it and set its value.
      obj1[p] = obj2[p];
    }
  }
  return obj1;
}

// Init scene.
init();
// Animate scene.
animate();

// Add scene to inspector.
window.scene = scene;
