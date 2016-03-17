var https = require('https'),
  fs = require('fs'),
  path = require('path'),
  os = require('os'),
  LocalError = require('./LocalError');

function LocalBinary(){
  this.hostOS = process.platform;
  this.is64bits = process.arch == 'x64';

  if(this.hostOS.match(/darwin|mac os/i)){
    this.httpPath = 'https://s3.amazonaws.com/browserStack/browserstack-local/BrowserStackLocal-darwin-x64';
  } else if(this.hostOS.match(/mswin|msys|mingw|cygwin|bccwin|wince|emc|win32/i)) {
    this.windows = true;
    this.httpPath = 'https://s3.amazonaws.com/browserStack/browserstack-local/BrowserStackLocal.exe';
  } else {
    if(this.is64bits)
      this.httpPath = 'https://s3.amazonaws.com/browserStack/browserstack-local/BrowserStackLocal-linux-x64';
    else
      this.httpPath = 'https://s3.amazonaws.com/browserStack/browserstack-local/BrowserStackLocal-linux-ia32';
  }

  this.download = function(destParentDir, callback){
    if(!this.checkPath(destParentDir))
      fs.mkdirSync(destParentDir);

    var destBinaryName = (this.windows) ? 'BrowserStackLocal.exe' : 'BrowserStackLocal';
    var binaryPath = path.join(destParentDir, destBinaryName);
    var file = fs.createWriteStream(binaryPath);

    https.get(this.httpPath, function (response) {
      response.on('end', function () {
        fs.chmod(binaryPath, '0755', function() {
          callback(binaryPath);
        });
      });
      response.pipe(file);
    });
  };

  this.binaryPath = function(callback){
    var destParentDir = this.getAvailableDirs();
    var destBinaryName = (this.windows) ? 'BrowserStackLocal.exe' : 'BrowserStackLocal';
    var binaryPath = path.join(destParentDir, destBinaryName);
    if(this.checkPath(binaryPath, fs.X_OK)){
      callback(binaryPath);
    } else {
      this.download(destParentDir, callback);
    }
  };

  this.checkPath = function(path, mode){
    mode = mode || (fs.R_OK | fs.W_OK);
    try {
      fs.accessSync(path, mode);
      return true;
    } catch(e){
      if(typeof fs.accessSync !== 'undefined') return false;

      // node v0.10
      try {
        fs.statSync(path);
        return true;
      } catch (e){
        return false;
      }
    }
  };

  this.getAvailableDirs = function(){
    for(var i=0; i < this.orderedPaths.length; i++){
      var path = this.orderedPaths[i];
      if(this.makePath(path))
        return path;
    }
    throw new LocalError('Error trying to download BrowserStack Local binary');
  };

  this.makePath = function(path){
    try {
      if(!this.checkPath(path)){
        fs.mkdirSync(path);
      }
      return true;
    } catch(e){
      return false;
    }
  };

  this.homedir = function() {
    if(typeof os.homedir === 'function') return os.homedir();

    var env = process.env;
    var home = env.HOME;
    var user = env.LOGNAME || env.USER || env.LNAME || env.USERNAME;

    if (process.platform === 'win32') {
      return env.USERPROFILE || env.HOMEDRIVE + env.HOMEPATH || home || null;
    }

    if (process.platform === 'darwin') {
      return home || (user ? '/Users/' + user : null);
    }

    if (process.platform === 'linux') {
      return home || (process.getuid() === 0 ? '/root' : (user ? '/home/' + user : null));
    }

    return home || null;
  };

  this.orderedPaths = [
    path.join(this.homedir(), '.browserstack'),
    process.cwd(),
    os.tmpdir()
  ];
}

module.exports = LocalBinary;
