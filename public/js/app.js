// todo:
// current.config to/from db
// animate only on change / reduce cpu usage
// browserify / require js
// dynamic tire sizing
// vioffroad decals

// Initialize app.
var app = angular.module('configurator', ['colorpicker.module']);

// Add config controller
app.controller('config', function($scope) {

    // Load config options.
    $scope.config = config;

    // Set default config.
    $scope.current = current;

    // Set camera controls
    $scope.camera = {
      'autoRotate': true,
    }

    // Save config.
    $scope.save = function() {
        console.log('save');
        console.log($scope.current);
    }
});

// Add three js viewer
app.directive('ngViewer', ['$window', function ($window) {
    return {
        restrict: 'A',
        link: function (scope, elem, attr) {

            // Set up global variables.
            var scene, camera, renderer, light,
            vehicle, wheels = {};
            var cameraRotSpeed = 0.001;

            // Collada loader.
            var loader = new THREE.ColladaLoader();

            // Initialization function.
            scope.init = function () {

              // Container dimensions.
              scope.containerWidth = $window.innerWidth,
              scope.containerHeight = $window.innerHeight;

              // Create scene.
              scene = new THREE.Scene;

              // Create renderer and set size.
              renderer = new THREE.WebGLRenderer({antialias:true, alpha: true});
              renderer.setSize($window.innerWidth, $window.innerHeight);
              renderer.shadowMap.enabled = true;

              // Add renderer to DOM.
              elem[0].appendChild(renderer.domElement);

              // Add camera.
              camera = new THREE.PerspectiveCamera(24, $window.innerWidth / $window.innerHeight, .1, 500);
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
              scope.loadVehicle();

              // Load ground.
              scope.loadGround();
            };

            // Window resize.
            angular.element($window).bind('resize', function(){
              // Set size and aspect.
              camera.aspect = $window.innerWidth / $window.innerHeight;
              camera.updateProjectionMatrix();
              renderer.setSize($window.innerWidth, $window.innerHeight);
            });

            // Animate.
            scope.animate = function () {
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
                camera.position.x = x * Math.cos(cameraRotSpeed) + z * Math.sin(cameraRotSpeed);
                camera.position.z = z * Math.cos(cameraRotSpeed) - x * Math.sin(cameraRotSpeed);
              }
              camera.lookAt(new THREE.Vector3(0, 0.75, 0));
              // Update TWEEN.
              TWEEN.update();
              // Render scene.
              renderer.render(scene, camera);
            };

            // Load vehicle.
            scope.loadVehicle = function () {
              var vehicle_name = scope.current.vehicle.id;
              loader.load(scope.config.vehicles[vehicle_name]['model'], function(vehicleModel) {
                // Remove existing vehicle.
                if (typeof vehicle !== 'undefined') {
                  scene.remove(vehicle);
                }
                // Create object.
                vehicle = vehicleModel.scene;
                // Set name.
                vehicle.name = vehicle_name;
                // Set height.
                var height = scope.getVehicleHeight();
                vehicle.position.y = height + 0.1; // add a little extra for a 'drop in' effect.
                // Update shadows & materials.
                scope.setVehicleColor();
                // Refresh wheels.
                scope.loadWheels();
                // Add vehicle to scene.
                scene.add(vehicle);
                // Add addons
                scope.loadVehicleAddons();
              });
            }

            // Load wheels.
            scope.loadWheels = function () {
              // Load new wheel.
              loader.load(scope.config.wheels[scope.current.wheel.id]['model'], function(wheelModel) {
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
                var axle_height = scope.config.wheels[scope.current.wheel.id]['diameter'] / 2;
                var wheel_offset = scope.config.vehicles[scope.current.vehicle.id]['wheel_offset'];
                var axle_front = scope.config.vehicles[scope.current.vehicle.id]['axle_front'];
                var axle_rear = scope.config.vehicles[scope.current.vehicle.id]['axle_rear'];
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
                  scope.setVehicleHeight();
                }
              });
            }

            // Load vehicle addons.
            scope.loadVehicleAddons = function () {
              var addons = scope.current.vehicle.addons;
              for (var addon in addons) {
                // skip loop if the property is from prototype
                if (!addons.hasOwnProperty(addon)) continue;
                // Load addon.
                scope.loadVehicleAddon(addon);
              }
            }

            // Load vehicle addon..
            scope.loadVehicleAddon = function (addon_name) {
              // Remove old addon.
              var old_addon = vehicle.getObjectByName(addon_name);
              vehicle.remove(old_addon);
              // Get new addon selection.
              var addon_selection = scope.current.vehicle.addons[addon_name];
              // Load new addon.
              loader.load(scope.config.vehicles[vehicle.name]['addons'][addon_name]['options'][addon_selection]['model'], function(addonModel) {
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

            // Get vehicle height
            scope.getVehicleHeight = function () {
              var axle_height = scope.config.wheels[scope.current.wheel.id]['diameter'] / 2;
              var liftInches = typeof scope.current.vehicle.lift !== 'undefined' ? scope.current.vehicle.lift : 0;
              var height = axle_height + (liftInches * 2.54) / 100; // adding lift height converted to meters.
              return height;
            }

            // Set vehicle height.
            scope.setVehicleHeight = function () {
              var height = scope.getVehicleHeight();
              new TWEEN.Tween(vehicle.position).to({y: height}, 1000).easing(TWEEN.Easing.Elastic.Out).start();
            }

            // Set vehicle color.
            scope.setVehicleColor = function () {
              // Traverse object
              vehicle.traverse(function (child) {
                // Cast shadows from mesh.
                if (child instanceof THREE.Mesh) {
                  child.castShadow = true;
                  // Set material.
                  if (child.material.type === 'MeshPhongMaterial') {
                    scope.setMaterials(child.material);
                  }
                }
              });
            }

            // Update materials.
            scope.setMaterials = function (material) {
              // Switch materials.
              switch (material.name) {
                // Body paint.
                case 'body':
                  material.envMap = textureCube;
                  material.reflectivity = 0.5;
                  material.color.setStyle(scope.current.vehicle.color);
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
            scope.loadGround = function () {
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

