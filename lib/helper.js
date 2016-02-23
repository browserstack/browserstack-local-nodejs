var path = require('path'),
  log = require('npmlog'),
  os = require('os');

function helper() {
  this.getPlatform = function() {
    return os.platform();
  };
  this.getArch = function() {
    return os.arch();
  };
  var getTempDir = function() {
    if(this.platform === 'win32') {
      return process.env.TEMP || process.env.TMP || (process.env.SystemRoot || process.env.windir) + '\\temp';
    } else {
      return process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
    }
  };

  const osHomedir = require('os-homedir');
  const basePaths = [ path.join(osHomedir(), '.browserstack'), path.join(__dirname, '..'), getTempDir() ];
  var currentBaseIndex = 0;
  var basePath = basePaths[0];

  const localBinaryName = 'BrowserStackLocal' + ( this.getPlatform() === 'win32' ? '.exe' : '' );
  const logFileName = 'local.log';

  this.getBinaryPath = function() {
    return path.resolve(path.join(basePath, localBinaryName));
  };
  this.setBasePath = function(path) {
    currentBaseIndex = -1;
    basePath = path;
  };
  this.getBasePath = function() {
    return basePath;
  };
  this.fallbackBase = function() {
    currentBaseIndex += 1;
    if (basePaths.length <= currentBaseIndex) {
      var pathString = (this.getPlatform() === 'win32') ? 'C:\\Users\\Admin\\Desktop' : '/Users/user/home/';
      throw new Error('No new Path to try. Try specifying custom path in constructor as "path": "' + pathString + '"');
    }
    basePath = basePaths[currentBaseIndex];
    log.warn('Falling Back to ' + basePath);
  };

  if(process.env.NODE_ENV === 'testing') {
    log.level = 'silent';
  }
  this.log = log;

  this.getLogFilePath = function() {
    return path.resolve(path.join(basePath, logFileName));
  };
}

exports.helper = helper;
