// Requires.
var gulp = require('gulp'),
    concat = require('gulp-concat'),
    rename = require('gulp-rename'),
    sourcemaps = require('gulp-sourcemaps');
    uglify = require('gulp-uglify');
    cleanCSS = require('gulp-clean-css');
    watch = require('gulp-watch');
    batch = require('gulp-batch');

// Build task.
gulp.task('build', ['build-js', 'build-css']);

// Build js.
gulp.task('build-js', function() {
  return gulp.src([
      './node_modules/three/three.js',
      './node_modules/three/examples/js/loaders/ColladaLoader2.js',
      './node_modules/three/examples/js/controls/OrbitControls.js',
      './node_modules/three/examples/js/materials/ShadowMaterial.js',
      './node_modules/tween.js/src/Tween.js',
      './node_modules/angular/angular.js',
      './node_modules/angular-bootstrap-colorpicker/js/bootstrap-colorpicker-module.js'
    ])
    .pipe(sourcemaps.init())
    .pipe(concat('libraries.min.js'))
    .pipe(uglify())
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('./public/js'));
});

// Build css.
gulp.task('build-css', function() {
  return gulp.src([
      './node_modules/angular-bootstrap-colorpicker/css/colorpicker.css',
      './public/css/styles.css'
    ])
    .pipe(sourcemaps.init())
    .pipe(concat('styles.min.css'))
    .pipe(cleanCSS())
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('./public/css'));
});
