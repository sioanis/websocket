const gulp = require('gulp');
const browserSync = require('browser-sync').create();
const reload = browserSync.reload;

gulp.task('serve', () => {
    browserSync.init({
      notify: false,
      port: 9000,
      server: {
        baseDir: ['app'],
      }
    });

    gulp.watch([
      'app/*',
    ]).on('change', reload);
});
