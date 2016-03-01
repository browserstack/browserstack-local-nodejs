var https = require('https'),
  fs = require('fs'),
  path = require('path'),
  os = require('os'),
  LocalError = require('./LocalError');

function LocalBinary(){
  this.hostOS = process.platform;
  this.is64bits = process.arch == 'x64';

  if(this.hostOS.match(/darwin|mac os/i)){
    this.httpPath = 'https://s3.amazonaws.com/bs-automate-prod/local/BrowserStackLocal-darwin-x64';
  } else if(this.hostOS.match(/mswin|msys|mingw|cygwin|bccwin|wince|emc/i)) {
    this.windows = true;
    this.httpPath = 'https://s3.amazonaws.com/bs-automate-prod/local/BrowserStackLocal-win32.exe';
  } else {
    if(this.is64bits)
      this.httpPath = 'https://s3.amazonaws.com/bs-automate-prod/local/BrowserStackLocal-linux-x64';
    else
      this.httpPath = 'https://s3.amazonaws.com/bs-automate-prod/local/BrowserStackLocal-linux-ia32';
  }

  this.orderedPaths = [
    path.join(os.homedir(), '.browserstack'),
    process.cwd(),
    os.tmpdir()
  ];

  this.download = function(destParentDir, callback){
    if(!this.checkPath(destParentDir))
      fs.mkdirSync(path);

    var binaryPath = destParentDir + './BrowserStackLocal';
    var file = fs.createWriteStream(binaryPath);

    https.get(this.http_path, function (response) {
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
    var binaryPath = path.join(destParentDir, 'BrowserStackLocal');
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
      return false;
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
}

module.exports = LocalBinary;
