// Requires.
var gulp = require('gulp'),
    stripDebug = require('gulp-strip-debug'),
    concat = require('gulp-concat'),
    rename = require('gulp-rename'),
    sourcemaps = require('gulp-sourcemaps');
    uglify = require('gulp-uglify');
    cleanCSS = require('gulp-clean-css');

// Build task.
gulp.task('build', ['build-js', 'build-css']);

// Build js.
gulp.task('build-js', function() {
  return gulp.src([
      './node_modules/angular/angular.js',
      './node_modules/angular-route/angular-route.js',
      './node_modules/angular-bootstrap-colorpicker/js/bootstrap-colorpicker-module.js',
      './node_modules/three/build/three.js',
      './node_modules/three/examples/js/loaders/ColladaLoader2.js',
      './node_modules/three/examples/js/controls/OrbitControls.js',
      './node_modules/three/examples/js/materials/ShadowMaterial.js',
      './node_modules/tween.js/src/Tween.js',
      './node_modules/sweetalert/dist/sweetalert-dev.js',
      './public/js/util.js',
    ])
    .pipe(sourcemaps.init())
    .pipe(stripDebug())
    .pipe(concat('libraries.min.js'))
    .pipe(uglify())
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('./public/js'));
});

// Build css.
gulp.task('build-css', function() {
  return gulp.src([
      './node_modules/reset-css/reset.css',
      './node_modules/angular-bootstrap-colorpicker/css/colorpicker.css',
      './node_modules/sweetalert/dist/sweetalert.css',
      //'./public/css/styles.css',
    ])
    .pipe(sourcemaps.init())
    .pipe(concat('styles.min.css'))
    .pipe(cleanCSS())
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('./public/css'));
});
