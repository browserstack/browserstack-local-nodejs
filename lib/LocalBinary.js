var https = require('https'),
  url = require('url'),
  fs = require('fs'),
  path = require('path'),
  os = require('os'),
  util = require('util'),
  childProcess = require('child_process'),
  zlib = require('zlib'),
  HttpsProxyAgent = require('https-proxy-agent'),
  version = require('../package.json').version,
  LocalError = require('./LocalError');

const packageName = 'browserstack-local-nodejs';

function LocalBinary(){
  this.hostOS = process.platform;
  this.is64bits = process.arch == 'x64';
  this.baseRetries = 9;
  this.sourceURL = null;
  this.downloadErrorMessage = null;

  this.getSourceUrl = function(conf, retries) {
    /* Request for an endpoint to download the local binary from Rails no more than twice with 5 retries each */
    if (![4, 9].includes(retries) && this.sourceURL != null) {
      return this.sourceURL;
    }

    if (process.env.BINARY_DOWNLOAD_SOURCE_URL !== undefined && process.env.BINARY_DOWNLOAD_FALLBACK_ENABLED == 'true' && this.parentRetries != 4) {
      /* This is triggered from Local.js if there's an error executing the downloaded binary */
      return process.env.BINARY_DOWNLOAD_SOURCE_URL;
    }

    let cmd, opts;
    cmd = 'node';
    opts = [path.join(__dirname, 'fetchDownloadSourceUrl.js'), this.key, this.bsHost];

    if (retries == 4 || (process.env.BINARY_DOWNLOAD_FALLBACK_ENABLED == 'true' && this.parentRetries == 4)) {
      opts.push(true, this.downloadErrorMessage || process.env.BINARY_DOWNLOAD_ERROR_MESSAGE);
    } else {
      opts.push(false, null);
    }

    if(conf.proxyHost && conf.proxyPort) {
      opts.push(conf.proxyHost, conf.proxyPort);
      if (conf.useCaCertificate) {
        opts.push(conf.useCaCertificate);
      }
    } else if (conf.useCaCertificate) {
      opts.push(undefined, undefined, conf.useCaCertificate);
    }

    const userAgent = [packageName, version].join('/');
    const env = Object.assign({ 'USER_AGENT': userAgent }, process.env);
    const obj = childProcess.spawnSync(cmd, opts, { env: env });
    if(obj.stdout.length > 0) {
      this.sourceURL = obj.stdout.toString().replace(/\n+$/, '');
      process.env.BINARY_DOWNLOAD_SOURCE_URL = this.sourceURL;
      return this.sourceURL;
    } else if(obj.stderr.length > 0) {
      let output = Buffer.from(JSON.parse(JSON.stringify(obj.stderr)).data).toString();
      throw(output);
    }
  };

  this.getDownloadPath = function (conf, retries) {
    let sourceURL = this.getSourceUrl(conf, retries) + '/';

    if(this.hostOS.match(/darwin|mac os/i)){
      return sourceURL + 'BrowserStackLocal-darwin-x64';
    } else if(this.hostOS.match(/mswin|msys|mingw|cygwin|bccwin|wince|emc|win32/i)) {
      this.windows = true;
      return sourceURL + 'BrowserStackLocal.exe';
    } else {
      if(this.is64bits) {
        if(this.isAlpine())
          return sourceURL + 'BrowserStackLocal-alpine';
        else
          return sourceURL + 'BrowserStackLocal-linux-x64';
      } else {
        return sourceURL + 'BrowserStackLocal-linux-ia32';
      }
    }
  };

  this.isAlpine = function() {
    try {
      return childProcess.execSync('grep -w "NAME" /etc/os-release').includes('Alpine');
    } catch(e) {
      return false;
    }
  };

  this.binaryDownloadError = function(errorMessagePrefix, errorMessage) {
    console.error(errorMessagePrefix, errorMessage);
    this.downloadErrorMessage = errorMessagePrefix + ' : ' + errorMessage;
  };

  this.retryBinaryDownload = function(conf, destParentDir, callback, retries, binaryPath) {
    var that = this;
    if(retries > 0) {
      console.log('Retrying Download. Retries left', retries);
      fs.stat(binaryPath, function(err) {
        if(err == null) {
          fs.unlinkSync(binaryPath);
        }
        if(!callback) {
          return that.downloadSync(conf, destParentDir, retries - 1);
        }
        that.download(conf, destParentDir, callback, retries - 1);
      });
    } else {
      console.error('Number of retries to download exceeded.');
    }
  };

  this.downloadSync = function(conf, destParentDir, retries) {
    try {
      this.httpPath = this.getDownloadPath(conf, retries);
    } catch (e) {
      return console.error(`Unable to fetch the source url to download the binary with error: ${e}`);
    }

    console.log('Downloading in sync');
    var that = this;
    if(!this.checkPath(destParentDir))
      fs.mkdirSync(destParentDir);

    var destBinaryName = (this.windows) ? 'BrowserStackLocal.exe' : 'BrowserStackLocal';
    var binaryPath = path.join(destParentDir, destBinaryName);

    let cmd, opts;
    cmd = 'node';
    opts = [path.join(__dirname, 'download.js'), binaryPath, this.httpPath];
    if(conf.proxyHost && conf.proxyPort) {
      opts.push(conf.proxyHost, conf.proxyPort);
      if (conf.useCaCertificate) {
        opts.push(conf.useCaCertificate);
      }
    } else if (conf.useCaCertificate) {
      opts.push(undefined, undefined, conf.useCaCertificate);
    }

    try{
      const userAgent = [packageName, version].join('/');
      const env = Object.assign({ 'USER_AGENT': userAgent }, process.env);
      const obj = childProcess.spawnSync(cmd, opts, { env: env });
      let output;
      if(obj.stdout.length > 0) {
        if(fs.existsSync(binaryPath)){
          fs.chmodSync(binaryPath, '0755');
          return binaryPath;
        }else{
          that.binaryDownloadError('failed to download');
          return that.retryBinaryDownload(conf, destParentDir, null, retries, binaryPath);
        }
      } else if(obj.stderr.length > 0) {
        output = Buffer.from(JSON.parse(JSON.stringify(obj.stderr)).data).toString();
        that.binaryDownloadError(output);
        return that.retryBinaryDownload(conf, destParentDir, null, retries, binaryPath);
      }
    } catch(err) {
      that.binaryDownloadError('Download failed with error', util.format(err));
      return that.retryBinaryDownload(conf, destParentDir, null, retries, binaryPath);
    }
  };

  this.download = function(conf, destParentDir, callback, retries){
    try {
      this.httpPath = this.getDownloadPath(conf, retries);
    } catch (e) {
      return console.error(`Unable to fetch the source url to download the binary with error: ${e}`);
    }

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
    if (conf.useCaCertificate) {
      try {
        options.ca = fs.readFileSync(conf.useCaCertificate);
      } catch(err) {
        console.log('failed to read cert file', err);
      }
    }

    options.headers = Object.assign({}, options.headers, {
      'accept-encoding': 'gzip, *',
      'user-agent': [packageName, version].join('/'),
    });

    https.get(options, function (response) {
      const contentEncoding = response.headers['content-encoding'];
      if (typeof contentEncoding === 'string' && contentEncoding.match(/gzip/i)) {
        if (process.env.BROWSERSTACK_LOCAL_DEBUG_GZIP) {
          console.info('Using gzip in ' + options.headers['user-agent']);
        }

        response.pipe(zlib.createGunzip()).pipe(fileStream);
      } else {
        response.pipe(fileStream);
      }

      response.on('error', function(err) {
        that.binaryDownloadError('Got Error in binary download response', util.format(err));
        that.retryBinaryDownload(conf, destParentDir, callback, retries, binaryPath);
      });
      fileStream.on('error', function (err) {
        that.binaryDownloadError('Got Error while downloading binary file', util.format(err));
        that.retryBinaryDownload(conf, destParentDir, callback, retries, binaryPath);
      });
      fileStream.on('close', function () {
        fs.chmod(binaryPath, '0755', function() {
          callback(binaryPath);
        });
      });
    }).on('error', function(err) {
      that.binaryDownloadError('Got Error in binary downloading request', util.format(err));
      that.retryBinaryDownload(conf, destParentDir, callback, retries, binaryPath);
    });
  };

  this.binaryPath = function(conf, bsHost, key, parentRetries, callback){
    this.key = key;
    this.bsHost = bsHost;
    this.parentRetries = parentRetries;
    var destParentDir = this.getAvailableDirs();
    var destBinaryName = (this.windows) ? 'BrowserStackLocal.exe' : 'BrowserStackLocal';
    var binaryPath = path.join(destParentDir, destBinaryName);
    if(this.checkPath(binaryPath, fs.X_OK)){
      if(!callback) {
        return binaryPath;
      }
      callback(binaryPath);
    } else {
      let retries = this.baseRetries;
      if(!callback) {
        return this.downloadSync(conf, destParentDir, retries);
      }
      this.download(conf, destParentDir, callback, retries);
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
