const childProcess = require('child_process'),
  os = require('os'),
  fs = require('fs'),
  path = require('path'),
  running = require('is-running'),
  LocalBinary = require('./LocalBinary'),
  LocalError = require('./LocalError'),
  psTree = require('ps-tree');

function Local(){
  this.sanitizePath = function(rawPath) {
    const doubleQuoteIfRequired = this.windows && !rawPath.match(/"[^"]+"/) ? '"' : '';
    return doubleQuoteIfRequired + rawPath + doubleQuoteIfRequired;
  };

  this.windows = os.platform().match(/mswin|msys|mingw|cygwin|bccwin|wince|emc|win32/i);
  this.pid = undefined;
  this.isProcessRunning = false;
  this.retriesLeft = 5;
  this.key = process.env.BROWSERSTACK_ACCESS_KEY;
  this.logfile = this.sanitizePath(path.join(process.cwd(), 'local.log'));
  this.opcode = 'start';
  this.exitCallback;

  this.start = function(options, callback){
    this.userArgs = [];
    const that = this;
    this.addArgs(options);

    if(typeof options['onlyCommand'] !== 'undefined')
      return callback();

    this.getBinaryPath(function(binaryPath){
      that.binaryPath = binaryPath;
      childProcess.exec('echo "" > ' + that.logfile);

      that.opcode = 'start';
      that.tunnel = childProcess.execFile(that.binaryPath, that.getBinaryArgs(), function(error, stdout, stderr){
        if(error) {
          console.error('Error while trying to execute binary', error);
          if(that.retriesLeft > 0) {
            console.log('Retrying Binary Download. Retries Left', that.retriesLeft);
            that.retriesLeft -= 1;
            fs.unlinkSync(that.binaryPath);
            delete(that.binaryPath);
            that.start(options, callback);
            return;
          } else {
            callback(new LocalError(error.toString()));
          }
        }

        let data;
        if(!!stdout)
          data = JSON.parse(stdout);
        else if(stderr)
          data = JSON.parse(stderr);
        else {
          callback(new LocalError('No output received'));
          return;
        }

        if(data.state !== 'connected'){
          callback(new LocalError(data.message.message));
        } else {
          that.pid = data['pid'];
          that.isProcessRunning = true;
          callback();
        }
      });
    });
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
    for(const key in options){
      const value = options.key;

      switch(key){
      case 'key':
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
          this.binaryPath = this.sanitizePath(value);
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

  this.getBinaryPath = function(callback){
    if(typeof(this.binaryPath) == 'undefined'){
      this.binary = new LocalBinary();
      let conf = {};
      if(this.proxyHost && this.proxyPort){
        conf.proxyHost = this.proxyHost;
        conf.proxyPort = this.proxyPort;
      }
      this.binary.binaryPath(conf, callback);
    } else {
      console.log('BINARY PATH IS DEFINED');
      callback(this.binaryPath);
    }
  };

  this.getBinaryArgs = function(){
    const args = ['--daemon', this.opcode, '--log-file', this.logfile];
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
    for(const i in this.userArgs){
      args.push(this.userArgs[i]);
    }
    return args;
  };

  this.killAllProcesses = function(callback){
    psTree(this.pid, (err, children) => {
      const childPids = children.map(val => val.PID);
      const killChecker = setInterval(() => {
        if(childPids.length === 0) {
          clearInterval(killChecker);
          try {
            process.kill(this.pid);
            // This gives time to local binary to send kill signal to railsApp.
            setTimeout(() => {
              this.isProcessRunning = false;
              callback();
            }, 2000);
          } catch(err) {
            this.isProcessRunning = false;
            callback();
          }
        }
        for(const i in childPids) {
          try {
            process.kill(childPids[i]);
          } catch(err) {
            childPids.splice(i, 1);
          }
        }
      },500);
    });
  };
}

module.exports = Local;
