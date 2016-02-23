var fs = require('fs'),
  path = require('path'),
  log = require('npmlog'),
  os = require('os');

const osHomedir = require('os-homedir');
var basePath = osHomedir(),
  appendLogs = true;

exports.getPlatform = function() {
  return os.platform();
};
exports.gerArch = function() {
  return os.arch();
};

const localBinaryName = 'BrowserStackLocal' + ( exports.getPlatform() === 'win32' ? '.exe' : '' );
const zipName = 'BrowserStackLocal.zip';
const logFileName = 'local.log';

exports.getBinaryPath = function() {
  return path.resolve(path.join(basePath, localBinaryName));
};
exports.getZipPath = function() {
  return path.resolve(path.join(basePath, zipName));
};
exports.setBasePath = function(path) {
  basePath = path;
};
exports.getBasePath = function() {
  return basePath;
};

if(process.env.NODE_ENV === 'testing') {
  log.level = 'silent';
  appendLogs = false;
}
exports.log = log;

var getLogFilePath = function() {
  return path.resolve(path.join(basePath, logFileName));
};
exports.logBinaryOutput = function(log) {
  if(appendLogs) {
    fs.appendFile(getLogFilePath(), log, function (err) {
      if(err) {
        exports.log.warn('Error Ssaving log file to ' + getLogFilePath());
        appendLogs = false;
      }
    });
  }
};
