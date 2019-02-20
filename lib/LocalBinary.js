var https = require('https'),
  url = require('url'),
  fs = require('fs'),
  path = require('path'),
  os = require('os'),
  HttpsProxyAgent = require('https-proxy-agent'),
  LocalError = require('./LocalError');

function LocalBinary(){
  this.hostOS = process.platform;
  this.is64bits = process.arch == 'x64';

  if(this.hostOS.match(/darwin|mac os/i)){
    this.httpPath = 'https://s3.amazonaws.com/bstack-local-prod/BrowserStackLocal-darwin-x64';
  } else if(this.hostOS.match(/mswin|msys|mingw|cygwin|bccwin|wince|emc|win32/i)) {
    this.windows = true;
    this.httpPath = 'https://s3.amazonaws.com/bstack-local-prod/BrowserStackLocal.exe';
  } else {
    if(this.is64bits)
      this.httpPath = 'https://s3.amazonaws.com/bstack-local-prod/BrowserStackLocal-linux-x64';
    else
      this.httpPath = 'https://s3.amazonaws.com/bstack-local-prod/BrowserStackLocal-linux-ia32';
  }

  this.retryBinaryDownload = function(conf, destParentDir, callback, retries, binaryPath) {
    var that = this;
    if(retries > 0) {
      console.log('Retrying Download. Retries left', retries);
      fs.stat(binaryPath, function(err) {
        if(err == null) {
          fs.unlinkSync(binaryPath);
        }
        that.download(conf, destParentDir, callback, retries - 1);
      });
    } else {
      console.error('Number of retries to download exceeded.');
    }
  };

  this.download = function(conf, destParentDir, callback, retries){
    var that = this;
    if(!this.checkPath(destParentDir))
      fs.mkdirSync(destParentDir);

    var destBinaryName = (this.windows) ? 'BrowserStackLocal.exe' : 'BrowserStackLocal';
    var binaryPath = path.join(destParentDir, destBinaryName);
    var fileStream = fs.createWriteStream(binaryPath);

    var options = url.parse(this.httpPath);
    if(conf.proxyHost && conf.proxyPort) {
      options.agent = new HttpsProxyAgent({
        host: conf.proxyHost,
        port: conf.proxyPort
      });
    }

    https.get(options, function (response) {
      response.pipe(fileStream);
      response.on('error', function(err) {
        console.error('Got Error in binary download response', err);
        that.retryBinaryDownload(conf, destParentDir, callback, retries, binaryPath);
      });
      fileStream.on('error', function (err) {
        console.error('Got Error while downloading binary file', err);
        that.retryBinaryDownload(conf, destParentDir, callback, retries, binaryPath);
      });
      fileStream.on('close', function () {
        fs.chmod(binaryPath, '0755', function() {
          callback(binaryPath);
        });
      });
    }).on('error', function(err) {
      console.error('Got Error in binary downloading request', err);
      that.retryBinaryDownload(conf, destParentDir, callback, retries, binaryPath);
    });
  };

  this.binaryPath = function(conf, callback){
    var destParentDir = this.getAvailableDirs();
    var destBinaryName = (this.windows) ? 'BrowserStackLocal.exe' : 'BrowserStackLocal';
    var binaryPath = '"' + path.join(destParentDir, destBinaryName) + '"';
    if(this.checkPath(binaryPath, fs.X_OK)){
      callback(binaryPath);
    } else {
      this.download(conf, destParentDir, callback, 5);
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
