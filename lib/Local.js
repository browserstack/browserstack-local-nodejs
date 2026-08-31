var childProcess = require('child_process'),
  os = require('os'),
  fs = require('fs'),
  util = require('util'),
  path = require('path'),
  running = require('is-running'),
  LocalBinary = require('./LocalBinary'),
  LocalError = require('./LocalError'),
  version = require('../package.json').version,
  treeKill = require('tree-kill');

function Local(){
  this.sanitizePath = function(rawPath) {
    var doubleQuoteIfRequired = this.windows && !rawPath.match(/"[^"]+"/) ? '"' : '';
    return doubleQuoteIfRequired + rawPath + doubleQuoteIfRequired;
  };

  this.windows = os.platform().match(/mswin|msys|mingw|cygwin|bccwin|wince|emc|win32/i);
  this.pid = undefined;
  this.isProcessRunning = false;
  this.retriesLeft = 9;
  this.key = process.env.BROWSERSTACK_ACCESS_KEY;
  this.logfile = this.sanitizePath(path.join(process.cwd(), 'local.log'));
  this.opcode = 'start';
  this.exitCallback;

  this.errorRegex = /\*\*\* Error: [^\r\n]*/i;
  this.doneRegex = /Press Ctrl-C to exit/i;

  this.startSync = function(options) {
    this.userArgs = [];
    var that = this;
    this.addArgs(options);

    if(typeof options['onlyCommand'] !== 'undefined')
      return;

    const binaryPath = this.getBinaryPath(null, options['bs-host']);
    that.binaryPath = binaryPath;
    try {
      fs.writeFileSync(that.logfile, '');
    } catch(e) {
      console.error('Could not clear log file: ', e.message);
    }
    that.opcode = 'start';
    if(!this.binaryPath){
      return new LocalError('Couldn\'t find binary file');
    }
    try{
      const obj = childProcess.spawnSync(that.binaryPath, that.getBinaryArgs());
      if(obj.error)
        throw obj.error;
      this.tunnel = {pid: obj.pid};
      var result = that.parseBinaryOutput(obj.stdout, obj.stderr);
      if(result.error)
        return result.error;
      var data = result.data;
      if(data['state'] != 'connected'){
        return new LocalError(that.getErrorMessage(data));
      } else {
        that.pid = data['pid'];
        that.isProcessRunning = true;
        return;
      }
    }catch(error){
      const binaryDownloadErrorMessage = `Error while trying to execute binary: ${util.format(error)}`;
      console.error(binaryDownloadErrorMessage);
      if(that.retriesLeft > 0) {
        console.log('Retrying Binary Download. Retries Left', that.retriesLeft);
        that.retriesLeft -= 1;
        try {
          fs.unlinkSync(that.binaryPath);
        } catch(unlinkError) {
          // The binary may already be gone (a prior retry or a concurrent
          // instance); the retry only needs the path cleared for re-download.
          console.error('Could not delete binary: ', unlinkError.message);
        }
        delete(that.binaryPath);
        process.env.BINARY_DOWNLOAD_ERROR_MESSAGE = binaryDownloadErrorMessage;
        process.env.BINARY_DOWNLOAD_FALLBACK_ENABLED = true;
        return that.startSync(options);
      } else {
        throw new LocalError(error.toString());
      }
    }
  };

  this.start = function(options, callback){
    this.userArgs = [];
    var that = this;
    this.addArgs(options);

    if(typeof options['onlyCommand'] !== 'undefined')
      return callback();

    this.getBinaryPath(function(binaryPath){
      that.binaryPath = binaryPath;
      try {
        fs.writeFileSync(that.logfile, '');
      } catch(e) {
        console.error('Could not clear log file: ', e.message);
      }

      that.opcode = 'start';
      that.tunnel = childProcess.execFile(that.binaryPath, that.getBinaryArgs(), function(error, stdout, stderr){
        // Everything below runs inside node's exithandler: a throw here is an
        // uncaughtException the caller cannot catch, and a fall-through can
        // invoke the callback twice. Guard both structurally. See LOC-7325.
        var callbackCalled = false;
        var safeCallback = function(err){
          if(callbackCalled) return;
          callbackCalled = true;
          callback(err);
        };
        try {
          if(error) {
            const binaryDownloadErrorMessage = `Error while trying to execute binary: ${util.format(error)}`;
            console.error(binaryDownloadErrorMessage);
            if(that.retriesLeft > 0) {
              console.log('Retrying Binary Download. Retries Left', that.retriesLeft);
              that.retriesLeft -= 1;
              try {
                fs.unlinkSync(that.binaryPath);
              } catch(unlinkError) {
                // The binary may already be gone (a prior retry or a concurrent
                // instance); the retry only needs the path cleared for re-download.
                console.error('Could not delete binary: ', unlinkError.message);
              }
              delete(that.binaryPath);
              process.env.BINARY_DOWNLOAD_ERROR_MESSAGE = binaryDownloadErrorMessage;
              process.env.BINARY_DOWNLOAD_FALLBACK_ENABLED = true;
              that.start(options, callback);
              return;
            }
            // The binary can exit non-zero while still printing a JSON
            // diagnostic on stdout; prefer its message over the generic
            // execution error.
            var failure = that.parseBinaryOutput(stdout, stderr);
            if(failure.data && failure.data['state'] != 'connected') {
              safeCallback(new LocalError(that.getErrorMessage(failure.data)));
            } else {
              safeCallback(new LocalError(error.toString()));
            }
            return;
          }

          var result = that.parseBinaryOutput(stdout, stderr);
          if(result.error) {
            safeCallback(result.error);
            return;
          }
          if(result.data['state'] != 'connected'){
            safeCallback(new LocalError(that.getErrorMessage(result.data)));
          } else {
            that.pid = result.data['pid'];
            that.isProcessRunning = true;
            safeCallback();
          }
        } catch(err) {
          if(callbackCalled) throw err; // the caller's own callback threw — theirs to handle
          safeCallback(new LocalError(err.toString()));
        }
      });
    }, options['bs-host']);
  };

  // The binary reports failures as {"state": "...", "message": {"message": "..."}},
  // but not every non-connected payload carries a message key, and the value is
  // not guaranteed to be a string. Dereferencing it blindly throws, and inside
  // the execFile callback that throw is an uncaughtException the caller cannot
  // catch; a non-string message crashes consumers doing error.message.match().
  // See LOC-7325.
  this.getErrorMessage = function(data){
    var message = data && data['message'];
    if(message && typeof message === 'object')
      message = message['message'];
    if(typeof message === 'string' && message.length > 0)
      return message;
    return 'Failed to start BrowserStack Local';
  };

  // Raw binary output can be up to execFile's 1MB maxBuffer; truncate before
  // attaching it to an error so serializers don't dump the whole buffer.
  this.truncateForExtra = function(output){
    output = String(output);
    if(output.length <= 1024)
      return output;
    return output.slice(0, 1024) + ' [truncated ' + (output.length - 1024) + ' bytes]';
  };

  // Shared by start and startSync so both classify binary output the same way.
  // Returns {data} for a parsed JSON object, {error} otherwise — including
  // output that parses to null or a non-object ('null' is valid JSON, so a
  // parse guard alone does not cover it).
  this.parseBinaryOutput = function(stdout, stderr){
    var output = (stdout && stdout.length > 0) ? stdout : stderr;
    if(!output || output.length === 0)
      return { error: new LocalError('No output received') };
    var data;
    try {
      data = JSON.parse(output);
    } catch(parseError) {
      return { error: new LocalError('Invalid output received: ' + parseError.message, this.truncateForExtra(output)) };
    }
    if(!data || typeof data !== 'object')
      return { error: new LocalError('Invalid output received: expected a JSON object', this.truncateForExtra(output)) };
    return { data: data };
  };

  this.isRunning = function(){
    return this.pid && running(this.pid) && this.isProcessRunning;
  };

  this.stop = function (callback) {
    if(!this.pid) return callback();
    this.killAllProcesses(function(error){
      if(error) callback(new LocalError(error.toString()));
      callback();
    });
  };

  this.addArgs = function(options){
    for(var key in options){
      var value = options[key];

      switch(key){
      case 'key':
        if(value)
          this.key = value;
        break;

      case 'verbose':
        if(value.toString() !== 'true')
          this.verboseFlag = value;
        else {
          this.verboseFlag = '1';
        }
        break;

      case 'force':
        if(value)
          this.forceFlag = '--force';
        break;

      case 'only':
        if(value)
          this.onlyHosts = value;
        break;

      case 'onlyAutomate':
        if(value)
          this.onlyAutomateFlag = '--only-automate';
        break;

      case 'forcelocal':
      case 'forceLocal':
        if(value)
          this.forceLocalFlag = '--force-local';
        break;

      case 'localIdentifier':
        if(value)
          this.localIdentifierFlag = value;
        break;

      case 'f':
      case 'folder':
        if(value){
          this.folderFlag = '-f';
          this.folderPath = this.sanitizePath(value);
        }
        break;

      case 'useCaCertificate':
        if(value)
          this.useCaCertificate = value;
        break;

      case 'proxyHost':
        if(value)
          this.proxyHost = value;
        break;

      case 'proxyPort':
        if(value)
          this.proxyPort = value;
        break;

      case 'proxyUser':
        if(value)
          this.proxyUser = value;
        break;

      case 'proxyPass':
        if(value)
          this.proxyPass = value;
        break;

      case 'forceproxy':
      case 'forceProxy':
        if(value)
          this.forceProxyFlag = '--force-proxy';
        break;

      case 'logfile':
      case 'logFile':
        if(value)
          this.logfile = this.sanitizePath(value);
        break;

      case 'parallelRuns':
        if(value)
          this.parallelRunsFlag = value;
        break;

      case 'binarypath':
        if(value)
          this.binaryPath = value;
        break;

      default:
        if(value.toString().toLowerCase() == 'true'){
          this.userArgs.push('--' + key);
        } else {
          this.userArgs.push('--' + key);
          this.userArgs.push(value);
        }
        break;
      }
    }
  };

  this.getBinaryPath = function(callback, bsHost){
    if(typeof(this.binaryPath) == 'undefined'){
      this.binary = new LocalBinary();
      var conf = {};
      if(this.proxyHost && this.proxyPort){
        conf.proxyHost = this.proxyHost;
        conf.proxyPort = this.proxyPort;
      }
      if (this.useCaCertificate) {
        conf.useCaCertificate = this.useCaCertificate;
      }
      if(!callback) {
        return this.binary.binaryPath(conf, bsHost, this.key, this.retriesLeft);
      }
      this.binary.binaryPath(conf, bsHost, this.key, this.retriesLeft, callback);
    } else {
      console.log('BINARY PATH IS DEFINED');
      if(!callback) {
        return this.binaryPath;
      }
      callback(this.binaryPath);
    }
  };

  this.getBinaryArgs = function(){
    var args = ['--daemon', this.opcode, '--log-file', this.logfile, '--source', `nodejs-${version}`];
    if(this.key) {
      args.push('--key');
      args.push(this.key);
    }
    if(this.folderFlag)
      args.push(this.folderFlag);
    if(this.folderPath)
      args.push(this.folderPath);
    if(this.forceLocalFlag)
      args.push(this.forceLocalFlag);
    if(this.localIdentifierFlag){
      args.push('--local-identifier');
      args.push(this.localIdentifierFlag);
    }
    if(this.parallelRunsFlag){
      args.push('--parallel-runs');
      args.push(this.parallelRunsFlag.toString());
    }
    if(this.onlyHosts) {
      args.push('--only');
      args.push(this.onlyHosts);
    }
    if(this.onlyAutomateFlag)
      args.push(this.onlyAutomateFlag);
    if (this.useCaCertificate) {
      args.push('--use-ca-certificate');
      args.push(this.useCaCertificate);
    }
    if(this.proxyHost){
      args.push('--proxy-host');
      args.push(this.proxyHost);
    }
    if(this.proxyPort){
      args.push('--proxy-port');
      args.push(this.proxyPort);
    }
    if(this.proxyUser){
      args.push('--proxy-user');
      args.push(this.proxyUser);
    }
    if(this.proxyPass){
      args.push('--proxy-pass');
      args.push(this.proxyPass);
    }
    if(this.forceProxyFlag)
      args.push(this.forceProxyFlag);
    if(this.forceFlag)
      args.push(this.forceFlag);
    if(this.verboseFlag){
      args.push('--verbose');
      args.push(this.verboseFlag.toString());
    }
    for(var i in this.userArgs){
      args.push(this.userArgs[i]);
    }
    return args;
  };

  this.killAllProcesses = function(callback){
    treeKill(this.pid, 'SIGTERM', callback);
  };
}

module.exports = Local;
