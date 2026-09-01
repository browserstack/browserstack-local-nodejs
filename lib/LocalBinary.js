var https = require('https'),
  fs = require('fs'),
  path = require('path'),
  os = require('os'),
  url = require('url'),
  util = require('util'),
  childProcess = require('child_process'),
  zlib = require('zlib'),
  HttpsProxyAgent = require('https-proxy-agent'),
  version = require('../package.json').version,
  LocalError = require('./LocalError'),
  fetchDownloadSourceUrlAsync = require('./fetchDownloadSourceUrlAsync');

const packageName = 'browserstack-local-nodejs';

function LocalBinary(){
  this.hostOS = process.platform;
  this.is64bits = process.arch == 'x64';
  this.isArm64 = process.arch == 'arm64';
  this.baseRetries = 9;
  this.sourceURL = null;
  this.downloadErrorMessage = null;

  this.getSourceUrlSync = function(conf, retries) {
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

  this.getSourceUrl = function(conf, retries, callback) {
    /* Request for an endpoint to download the local binary from Rails no more than twice with 5 retries each */
    if (![4, 9].includes(retries) && this.sourceURL != null) {
      return callback(null, this.sourceURL);
    }

    if (process.env.BINARY_DOWNLOAD_SOURCE_URL !== undefined && process.env.BINARY_DOWNLOAD_FALLBACK_ENABLED == 'true' && this.parentRetries != 4) {
      /* This is triggered from Local.js if there's an error executing the downloaded binary */
      return callback(null, process.env.BINARY_DOWNLOAD_SOURCE_URL);
    }

    let downloadFallback = false;
    let downloadErrorMessage = null;

    if (retries == 4 || (process.env.BINARY_DOWNLOAD_FALLBACK_ENABLED == 'true' && this.parentRetries == 4)) {
      downloadFallback = true;
      downloadErrorMessage = this.downloadErrorMessage || process.env.BINARY_DOWNLOAD_ERROR_MESSAGE;
    }

    fetchDownloadSourceUrlAsync(this.key, this.bsHost, downloadFallback, downloadErrorMessage, conf.proxyHost, conf.proxyPort, conf.useCaCertificate, (err, sourceURL) => {
      if (err) return callback(err);
      this.sourceURL = sourceURL;
      process.env.BINARY_DOWNLOAD_SOURCE_URL = sourceURL;
      callback(null, sourceURL);
    });
  };

  this.getBinaryFilename = function() {
    if(this.hostOS.match(/darwin|mac os/i)){
      return 'BrowserStackLocal-darwin-x64';
    } else if(this.hostOS.match(/mswin|msys|mingw|cygwin|bccwin|wince|emc|win32/i)) {
      this.windows = true;
      return 'BrowserStackLocal.exe';
    } else {
      if(this.isArm64) {
        return 'BrowserStackLocal-linux-arm64';
      } else if(this.is64bits) {
        if(this.isAlpine())
          return 'BrowserStackLocal-alpine';
        else
          return 'BrowserStackLocal-linux-x64';
      } else {
        return 'BrowserStackLocal-linux-ia32';
      }
    }
  };

  this.getDownloadPath = function (conf, retries, callback) {
    this.getSourceUrl(conf, retries, (err, sourceURL) => {
      if (err) return callback(err);
      callback(null, sourceURL + '/' + this.getBinaryFilename());
    });
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

  this.removeBinaryIfPresentSync = function(binaryPath) {
    try {
      if(fs.existsSync(binaryPath))
        fs.unlinkSync(binaryPath);
    } catch(unlinkError) {
      // A held handle (AV scan) or permissions can make the delete fail;
      // the retry will overwrite the file anyway.
      console.error('Could not delete binary: ', unlinkError.message);
    }
  };

  this.retryBinaryDownload = function(conf, destParentDir, callback, retries, binaryPath) {
    var that = this;
    if(retries > 0) {
      console.log('Retrying Download. Retries left', retries);
      if(!callback) {
        // downloadSync consumes this return value. Deleting via an async
        // fs.stat callback made retryBinaryDownload return undefined, so
        // startSync reported "Couldn't find binary file" on the very first
        // failure while the retry chain kept running in the background and
        // held the event loop open. See LOC-7325.
        that.removeBinaryIfPresentSync(binaryPath);
        return that.downloadSync(conf, destParentDir, retries - 1);
      }
      fs.stat(binaryPath, function(err) {
        if(err == null)
          that.removeBinaryIfPresentSync(binaryPath);
        that.download(conf, destParentDir, callback, retries - 1);
      });
    } else {
      console.error('Number of retries to download exceeded.');
      // Deliver terminal failure instead of never calling back; Local.start
      // treats a falsy path as a non-retryable download failure.
      if(callback) {
        callback(null);
      }
    }
  };

  this.downloadSync = function(conf, destParentDir, retries) {
    try {
      this.httpPath = this.getSourceUrlSync(conf, retries) + '/' + this.getBinaryFilename();
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
    this.getDownloadPath(conf, retries, (err, downloadUrl) => {
      if(err) {
        // Nothing has touched the disk on this path, so retry the source-url
        // fetch directly — going through retryBinaryDownload here would
        // delete a pre-existing binary that this attempt never wrote to.
        this.binaryDownloadError('Unable to fetch the source url to download the binary with error', util.format(err));
        if(retries > 0) {
          console.log('Retrying Download. Retries left', retries);
          return this.download(conf, destParentDir, callback, retries - 1);
        }
        console.error('Number of retries to download exceeded.');
        // Deliver terminal failure instead of never calling back; Local.start
        // treats a falsy path as a non-retryable download failure.
        return callback(null);
      }

      this.httpPath = downloadUrl;

      var that = this;
      if(!this.checkPath(destParentDir))
        fs.mkdirSync(destParentDir);

      var destBinaryName = (this.windows) ? 'BrowserStackLocal.exe' : 'BrowserStackLocal';
      var binaryPath = path.join(destParentDir, destBinaryName);
      var fileStream = fs.createWriteStream(binaryPath);

      // Exactly one of the handlers below may resolve this download attempt
      // (retry or callback); a retried attempt gets a fresh settled flag.
      var settled = false;
      var settle = function() {
        if(settled) return true;
        settled = true;
        return false;
      };

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
        if (response.statusCode !== 200) {
          // Anything but 200 is not the binary. Without this check an error
          // body (404/403 HTML) was written to binaryPath and reported as a
          // successful download; >= 400 alone still let a 3xx through, since
          // https.get does not follow redirects and would have written the
          // redirect body itself, chmodded it 0755 and returned it as the
          // binary. See LOC-7325.
          if(settle()) return;
          response.resume();
          fileStream.destroy();
          that.binaryDownloadError('Got bad response while downloading binary, status code', String(response.statusCode));
          return that.retryBinaryDownload(conf, destParentDir, callback, retries, binaryPath);
        }

        const contentEncoding = response.headers['content-encoding'];
        if (typeof contentEncoding === 'string' && contentEncoding.match(/gzip/i)) {
          if (process.env.BROWSERSTACK_LOCAL_DEBUG_GZIP) {
            console.info('Using gzip in ' + options.headers['user-agent']);
          }

          var gunzip = zlib.createGunzip();
          gunzip.on('error', function (err) {
            // pipe() does not forward stream errors: without this listener a
            // corrupt gzip body was an uncaughtException (or a silent hang,
            // since fileStream then never emits 'error'/'close').
            if(settle()) return;
            fileStream.destroy();
            that.binaryDownloadError('Got Error while unzipping binary', util.format(err));
            that.retryBinaryDownload(conf, destParentDir, callback, retries, binaryPath);
          });
          response.pipe(gunzip).pipe(fileStream);
        } else {
          response.pipe(fileStream);
        }

        response.on('error', function(err) {
          if(settle()) return;
          // pipe() unpipes the destination on a source error but never ends
          // it: without this the write fd leaks and the retry below opens a
          // second writer on the same path.
          fileStream.destroy();
          that.binaryDownloadError('Got Error in binary download response', util.format(err));
          that.retryBinaryDownload(conf, destParentDir, callback, retries, binaryPath);
        });
        fileStream.on('error', function (err) {
          if(settle()) return;
          that.binaryDownloadError('Got Error while downloading binary file', util.format(err));
          that.retryBinaryDownload(conf, destParentDir, callback, retries, binaryPath);
        });
        fileStream.on('close', function () {
          // An errored stream still emits 'close' (autoDestroy); without the
          // guard this fired the callback in addition to the retry above.
          if(settle()) return;
          fs.chmod(binaryPath, '0755', function() {
            callback(binaryPath);
          });
        });
      }).on('error', function(err) {
        if(settle()) return;
        fileStream.destroy();
        that.binaryDownloadError('Got Error in binary downloading request', util.format(err));
        that.retryBinaryDownload(conf, destParentDir, callback, retries, binaryPath);
      });
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
