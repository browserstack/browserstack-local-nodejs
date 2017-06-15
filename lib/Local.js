var childProcess = require('child_process'),
  fs = require('fs'),
  path = require('path'),
  running = require('is-running'),
  LocalBinary = require('./LocalBinary'),
  LocalError = require('./LocalError');


function Local(){
  this.pid = undefined;
  this.retriesLeft = 5;
  this.key = process.env.BROWSERSTACK_ACCESS_KEY;
  this.logfile = path.join(process.cwd(), 'local.log');
  this.opcode = 'start';
  this.exitCallback;

  this.errorRegex = /\*\*\* Error: [^\r\n]*/i;
  this.doneRegex = /Press Ctrl-C to exit/i;

  this.start = function(options, callback){
    this.userArgs = [];
    var that = this;
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

        var data = {};
        if(stdout)
          data = JSON.parse(stdout);
        else if(stderr)
          data = JSON.parse(stderr);
        else
          callback(new LocalError('No output received'));

        if(data['state'] != 'connected'){
          callback(new LocalError(data['message']['message']));
        } else {
          that.pid = data['pid'];
          callback();
        }
      });

      // that.tunnel = childProcess.spawn(binaryPath, that.getBinaryArgs());
      // that.tunnel.on('exit', function(){
      //   that.tunnel = undefined;
      //   if(that.exitCallback) that.exitCallback();
      // });

      // that.stdout = fs.openSync(that.logfile, 'r');
      // var chunkSize = 512,
      //   buffer = new Buffer(81920),
      //   bytesRead = 0,
      //   error = undefined;

      // while(true){
      //   var bytes = fs.readSync(that.stdout, buffer, bytesRead, chunkSize, bytesRead);
      //   if(bytes == 0) continue;

      //   var buffRead = buffer.slice(bytesRead, bytesRead+bytes);
      //   bytesRead += bytes;

      //   var data = buffRead.toString();

      //   if(data.match(that.errorRegex)){
      //     fs.closeSync(that.stdout);
      //     error = data.match(that.errorRegex)[0].trim();
      //     break;
      //   }

      //   if(data.match(that.doneRegex)){
      //     fs.closeSync(that.stdout);
      //     break;
      //   }
      // }

      // if(error) throw new LocalError(error);
      // callback();
    });
  };

  this.isRunning = function(){
    return this.pid && running(this.pid);
  };

  this.stop = function (callback) {
    if(!this.pid) return callback();
    this.opcode = 'stop';
    this.tunnel = childProcess.execFile(this.binaryPath, this.getBinaryArgs(), function(error){
      if(error) callback(new LocalError(error.toString()));
      callback();
    });
  };

  this.addArgs = function(options){
    for(var key in options){
      var value = options[key];

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
          this.folderPath = value;
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
          this.logfile = value;
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

  this.getBinaryPath = function(callback){
    if(typeof(this.binaryPath) == 'undefined'){
      this.binary = new LocalBinary();
      var conf = {};
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
    var args = ['--daemon', this.opcode, '--log-file', this.logfile];
    if(this.folderFlag)
      args.push(this.folderFlag);
    if(this.key) {
      args.push('--key');
      args.push(this.key);
    }
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
    for(var i in this.userArgs){
      args.push(this.userArgs[i]);
    }
    return args;
  };
}

module.exports = Local;
