// todo:
// lights
// lightbars & accessories
// license plate
// optional addons
// spare tire (rear, roof)
// axle width selector
// tire width selector
// animate only on change / reduce cpu usage
// browserify / require js
// decals (vioffroad, etc)

// Initialize app.
var app = angular.module('configurator', ['colorpicker.module']);

// Add config controller
app.controller('config', function($scope) {

  // Config options.
  $scope.config = config;

  // Default config.
  $scope.current = current;

  // Camera controls.
  $scope.camera = {
    'autoRotate': true,
  }

  // Editor.
  $scope.editor = {
    'visible': true,
  }

  // Toggle editor.
  $scope.editor.toggle = function() {
    $scope.editor.visible = !$scope.editor.visible;
  }

  // Only show addons section if options exist.
  $scope.adddonsExist = function() {
    return Object.keys($scope.config.vehicles[$scope.current.vehicle.id].addons).length > 0 ? true : false;
  }

  // Save current config.
  $scope.editor.save = function() {
    // Store current config to db.
    firebase.database().ref('/configs/' + $scope.session).set($scope.current);
    // push session string to url.
    window.history.pushState({}, 'Save', '/' + $scope.session);
    // Notify user.
    swal("Vehicle saved!", "Please copy or bookmark this page. Anyone with this URL may edit the vehicle.", "success");
  }

  // Request new part.
  $scope.editor.request = function() {
    // Popup.
    swal(
      {
        title: "Vehicle Request",
        text: "Would you like your vehicle added or is there an addon we're missing? Let us know!",
        type: "input",
        showCancelButton: true,
        closeOnConfirm: false,
        inputPlaceholder: "Enter vehicle or part name here."
      },
      function(inputValue) {
        if (inputValue === false) return false;
        if (inputValue === "") {
          swal.showInputError("You need to write something!");
          return false;
        }
        // Save request.
        firebase.database().ref('/requests').push(inputValue);
        // Notify user.
        swal("Awesome!", "Thanks for the suggestion! We'll add it to the list.", "success");
      }
    );
  }

});

// Add three js viewer
app.directive('ngViewer', ['$window', function ($window) {
  return {
    restrict: 'A',
    link: function (scope, elem, attr) {

      // Set up global variables.
      var scene, camera, renderer, loader, light, envMap, session, loading,
      vehicle, rims, rim, rimSpare, tires, tire, tireSpare = {};

      // Default addons.
      scope.current.vehicle.addons = scope.config.vehicles[scope.current.vehicle.id].default_addons;

      // Start loading manager.
      loadingManager = new THREE.LoadingManager();
      loadingManager.onProgress = function (item, loaded, total) {
        // loading progress.
      };
      loadingManager.onLoad = function () {
        scope.hideLoader();
      };
      loadingManager.onError = function () {
        console.log('loading error');
      };

      // Show loader.
      scope.showLoader = function() {
        document.getElementById('loader').style.display = 'table';
      }

      // Hide loader.
      scope.hideLoader = function() {
        document.getElementById('loader').style.display = 'none';
      }

      // Initialization function.
      scope.init = function() {

        // Create scene.
        scene = new THREE.Scene;

        // Create renderer and set size.
        renderer = new THREE.WebGLRenderer({antialias:true, alpha: true});
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;

        // Add renderer to DOM.
        elem[0].appendChild(renderer.domElement);

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
        scope.loadGround();

        // Set up vehicle
        vehicle = new THREE.Object3D();
        scene.add(vehicle);

        // Set up wheels.
        rims = new THREE.Object3D();
        scene.add(rims);

        tires = new THREE.Object3D();
        scene.add(tires);

        scope.setWheelHeight();

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
              // Update angular digest.
              scope.$apply(function(){
                // Overwrite current from response.
                scope.current = MergeRecursive(scope.current, data.val());
              });
              // Load vehicle.
              scope.loadVehicle();
            }
            else {
              // Set new session.
              session = randomString(16);
              // Load vehicle.
              scope.loadVehicle();
            }
          });
        }
        else {
          // Set new session.
          session = randomString(16);
          // Load vehicle.
          scope.loadVehicle();
        }

      };

      // Window resize.
      angular.element($window).bind('resize', function(){
        // Set size and aspect.
        camera.aspect = $window.innerWidth / $window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize($window.innerWidth, $window.innerHeight);
      });

      // Animate.
      scope.animate = function() {
        requestAnimationFrame(scope.animate);
        scope.render();
      };

      // Render scene.
      scope.render = function () {
        // Update camera controls.
        cameraControls.update();
        // Auto rotate camera.
        if (scope.camera.autoRotate) {
          var x = camera.position.x;
          var z = camera.position.z;
          camera.position.x = x * Math.cos(scope.current.camera.speed) + z * Math.sin(scope.current.camera.speed);
          camera.position.z = z * Math.cos(scope.current.camera.speed) - x * Math.sin(scope.current.camera.speed);
        }
        camera.lookAt(new THREE.Vector3(0, 0.75, 0));
        // Update TWEEN.
        TWEEN.update();
        // Render scene.
        renderer.render(scene, camera);
      };

      // Load vehicle.
      scope.loadVehicle = function() {
        // Show loader.
        scope.showLoader();
        // Load vehicle model.
        colladaLoader.load(scope.config.vehicles[scope.current.vehicle.id]['model'], function(vehicleModel) {
          // Remove existing vehicle.
          if (typeof vehicle !== 'undefined') {
            scene.remove(vehicle);
          }
          // Create object.
          vehicle = vehicleModel.scene;
          // Set height.
          var height = scope.getVehicleHeight();
          vehicle.position.y = height + 0.1; // add a little extra for a 'drop in' effect.
          // Update shadows & materials.
          scope.setVehicleColor();
          // Load rims.
          scope.loadRims();
          // Load tires.
          scope.loadTires();
          // Add vehicle to scene.
          scene.add(vehicle);
          // Get default addons.
          scope.current.vehicle.addons = scope.config.vehicles[scope.current.vehicle.id].default_addons;
          // Add addons
          scope.loadVehicleAddons();
        });
      }

      // Load rims.
      scope.loadRims = function() {
        // Show loader.
        scope.showLoader();
        // Load rim model.
        colladaLoader.load(scope.config.wheels.rims[scope.current.wheels.rim].model, function(rimModel) {
          // Remove existing rims.
          for ( var i = rims.children.length - 1; i >= 0; i--) {
            if (rims.children.hasOwnProperty(i)) {
              rims.remove(rims.children[i]);
            }
          }

          // Create object.
          rim = rimModel.scene;

          // rim variables.
          var offset = scope.config.vehicles[scope.current.vehicle.id]['wheel_offset'];
          var axleFront = scope.config.vehicles[scope.current.vehicle.id]['axle_front'];
          var axleRear = scope.config.vehicles[scope.current.vehicle.id]['axle_rear'];
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
          // rimSpare = rim.clone();
          // rimSpare.visibility = false;
          // rimSpare.rotateZ(Math.PI);
          // rimSpare.position.set(0, 0.7, -2.45);
          // rims.add(rimSpare);

          // Update rim size
          scope.setRimSize();

          // Set rim color
          scope.setRimColor();
        });
      }

      // Load tires.
      scope.loadTires = function() {
        // Show loader.
        scope.showLoader();
        // Load tire model.
        colladaLoader.load(scope.config.wheels.tires[scope.current.wheels.tire].model, function(tireModel) {
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
          var offset = scope.config.vehicles[scope.current.vehicle.id]['wheel_offset'];
          var axleFront = scope.config.vehicles[scope.current.vehicle.id]['axle_front'];
          var axleRear = scope.config.vehicles[scope.current.vehicle.id]['axle_rear'];
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
          // tireSpare = tire.clone();
          // tireSpare.visibility = false;
          // tireSpare.rotateZ(Math.PI);
          // tireSpare.position.set(0, 0.7, -2.45);
          // tires.add(tireSpare);

          // Set size.
          scope.setTireSize();
          // Update vehicle height.
          if (typeof vehicle !== 'undefined') {
            scope.setVehicleHeight();
          }
        });
      }

      // Set wheel size.
      scope.setWheelSize = function() {
        scope.setRimSize();
        scope.setTireSize();
      }

      // Set rim size.
      scope.setRimSize = function() {
        // determine rim scale as a percentage of diameter
        var od = (scope.current.wheels.rim_size * 2.54) / 100;
        var od_scale = (od + 0.03175) / scope.config.wheels.rims[scope.current.wheels.rim].od;

        var width = (scope.current.wheels.rim_width * 2.54) / 100;
        var width_scale = width / scope.config.wheels.rims[scope.current.wheels.rim].width;

        // Loop through rims.
        for ( var i = 0; i < rims.children.length; i ++ ) {
          if (rims.children.hasOwnProperty(i)) {
            // Set scale.
            rims.children[i].scale.set(od_scale, width_scale, od_scale);
          }
        }
      };

      // Set tire size.
      scope.setTireSize = function() {
        // determine y scale as a percentage of width
        var wheel_width = (scope.current.wheels.rim_width * 2.54) / 100;
        var wheel_width_scale = wheel_width / scope.config.wheels.tires[scope.current.wheels.tire].width;

        var od = scope.config.wheels.tires[scope.current.wheels.tire].od / 2;
        var id = scope.config.wheels.tires[scope.current.wheels.tire].id / 2;

        var newOd = ((scope.current.wheels.tire_size * 2.54) / 10) / 2;
        var newId = ((scope.current.wheels.rim_size * 2.54) / 10) / 2;

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
            scope.setVehicleHeight();
            // Update wheel height.
            scope.setWheelHeight();
          }
        });
      }

      // Load vehicle addons.
      scope.loadVehicleAddons = function() {
        var addons = scope.current.vehicle.addons;
        for (var addon in addons) {
          // skip loop if the property is from prototype
          if (!addons.hasOwnProperty(addon)) continue;
          // Load addon.
          scope.loadVehicleAddon(addon);
        }
      }

      // Load vehicle addon..
      scope.loadVehicleAddon = function(addon_name) {
        // Remove old addon.
        var old_addon = vehicle.getObjectByName(addon_name);
        vehicle.remove(old_addon);
        // Get new addon selection.
        var addon_selection = scope.current.vehicle.addons[addon_name];

        if(addon_selection) {
          // Show loader.
          scope.showLoader();
          // Load new addon.
          colladaLoader.load(scope.config.vehicles[scope.current.vehicle.id]['addons'][addon_name]['options'][addon_selection]['model'], function(addonModel) {
            // Create object.
            addon = addonModel.scene;
            addon.name = addon_name;
            addon.rotation.x = 0;
            // Add to vehicle.
            vehicle.add(addon);
            // Update colors.
            scope.setVehicleColor();
          });
        }
      }

      // Toggle spare visibility.
      scope.toggleSpareWheel = function() {
        rimSpare.visible = scope.current.wheels.spare;
        tireSpare.visible = scope.current.wheels.spare;
      }

      // Get wheel (axle) height.
      scope.getWheelHeight = function() {
        var height = ((scope.current.wheels.tire_size * 2.54) / 100) / 2;
        return height;
      }

      // Set wheel height.
      scope.setWheelHeight = function() {
        var height = scope.getWheelHeight();
        rims.position.set(0, height, 0);
        tires.position.set(0, height, 0);
      }

      // Get vehicle height
      scope.getVehicleHeight = function() {
        var axle_height = scope.getWheelHeight();
        var liftInches = typeof scope.current.vehicle.lift !== 'undefined' ? scope.current.vehicle.lift : 0;
        var height = axle_height + (liftInches * 2.54) / 100; // adding lift height converted to meters.
        return height;
      }

      // Set vehicle height.
      scope.setVehicleHeight = function() {
        var height = scope.getVehicleHeight();
        new TWEEN.Tween(vehicle.position).to({y: height}, 1000).easing(TWEEN.Easing.Elastic.Out).start();
      }

      // Set vehicle color.
      scope.setVehicleColor = function() {
        // Traverse object
        vehicle.traverse(function (child) {
          if (child instanceof THREE.Mesh) {
            // Cast shadows from mesh.
            child.castShadow = true;
            // Set material.
            if (child.material.type === 'MeshPhongMaterial') {
              scope.setMaterials(child.material);
            }
          }
        });
      }

      // Set wheel color.
      scope.setRimColor = function() {
        // Traverse object
        rim.traverse(function (child) {
          if (child instanceof THREE.Mesh) {
            // Cast shadows from mesh.
            child.castShadow = true;
            // Set material.
            if (child.material.type === 'MeshPhongMaterial') {
              scope.setMaterials(child.material);
            }
          }
        });
      }

      // Update materials.
      scope.setMaterials = function(material) {
        var silver = new THREE.Color(0.8, 0.8, 0.8);
        var white = new THREE.Color(1, 1, 1);
        var black = new THREE.Color(0.2, 0.2, 0.2);
        // Switch materials.
        switch (material.name) {
          // Body paint.
          case 'body':
            material.envMap = envMap;
            material.reflectivity = scope.current.vehicle.reflectivity;
            material.color.setStyle(scope.current.vehicle.color);
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
            switch (scope.current.wheels.rim_color) {
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
      scope.loadGround = function() {
        var transparentmaterial = new THREE.ShadowMaterial();
        transparentmaterial.opacity = 0.5;
        var ground = new THREE.Mesh(new THREE.PlaneBufferGeometry(10, 10), transparentmaterial);
        ground.rotation.x = -Math.PI/2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        scene.add(ground);
      }

      // Init scene.
      scope.init();
      // Animate scene.
      scope.animate();

      // Add scene to inspector.
      window.scene = scene;

    }
  }
}]);
