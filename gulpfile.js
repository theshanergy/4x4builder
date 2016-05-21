// Requires.
var gulp = require('gulp'),
    concat = require('gulp-concat'),
    rename = require('gulp-rename'),
    sourcemaps = require('gulp-sourcemaps');
    uglify = require('gulp-uglify');
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
      './src/js/config.js',
      './src/js/app.js'
    ])
    .pipe(sourcemaps.init())
    .pipe(concat('scripts.min.js'))
    .pipe(uglify())
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('./build/js'));
});

// Build css.
gulp.task('build-css', function() {
  return gulp.src([
      './src/css/style.css'
    ])
    .pipe(gulp.dest('./build/css'));
});

// Watch changes.
gulp.task('watch', function () {
  watch('./src/**/*.{js,css}', batch(function(events, done) {
    gulp.start('build', done);
  }));
});

// Default task.
gulp.task('default', ['build', 'watch']);
