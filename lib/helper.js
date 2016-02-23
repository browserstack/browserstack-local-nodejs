var fs = require('fs'),
  path = require('path'),
  log = require('npmlog'),
  os = require('os');

function helper() {
  const osHomedir = require('os-homedir');
  var basePath = osHomedir(),
    appendLogs = true;

  this.getPlatform = function() {
    return os.platform();
  };
  this.getArch = function() {
    return os.arch();
  };

  const localBinaryName = 'BrowserStackLocal' + ( this.getPlatform() === 'win32' ? '.exe' : '' );
  const zipName = 'BrowserStackLocal.zip';
  const logFileName = 'local.log';

  this.getBinaryPath = function() {
    return path.resolve(path.join(basePath, localBinaryName));
  };
  this.getZipPath = function() {
    return path.resolve(path.join(basePath, zipName));
  };
  this.setBasePath = function(path) {
    basePath = path;
  };
  this.getBasePath = function() {
    return basePath;
  };

  if(process.env.NODE_ENV === 'testing') {
    log.level = 'silent';
    appendLogs = false;
  }
  this.log = log;

  var getLogFilePath = function() {
    return path.resolve(path.join(basePath, logFileName));
  };
  this.logBinaryOutput = function(log) {
    if(appendLogs) {
      fs.appendFile(getLogFilePath(), log, function (err) {
        if(err) {
          exports.log.warn('Error Ssaving log file to ' + getLogFilePath());
          appendLogs = false;
        }
      });
    }
  };
}

exports.helper = helper;
