
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

  // Vehicle shininess.
  guiVehicle.add(current.vehicle, 'reflectivity', 0, 1).name('Shine').onChange(function(value){
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
  guiWheels.add(current.wheels, 'rim_size', 14, 24).step(1).name('Rim Size').onFinishChange(function(value){
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
  // todo: Spare

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
