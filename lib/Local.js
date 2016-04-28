var childProcess = require('child_process'),
  fs = require('fs'),
  path = require('path'),
  running = require('is-running'),
  LocalBinary = require('./LocalBinary'),
  LocalError = require('./LocalError');


function Local(){
  this.pid = undefined;
  this.key = process.env.BROWSERSTACK_ACCESS_KEY;
  this.logfile = path.join(process.cwd(), 'local.log');
  this.exitCallback;
  this.userArgs = [];

  this.errorRegex = /\*\*\* Error: [^\r\n]*/i;
  this.doneRegex = /Press Ctrl-C to exit/i;

  this.start = function(options, callback){
    var that = this;
    this.addArgs(options);

    if(typeof options['onlyCommand'] !== 'undefined')
      return callback();

    this.getBinaryPath(function(binaryPath){
      that.binaryPath = binaryPath;
      childProcess.exec('echo "" > ' + that.logfile);

      that.tunnel = childProcess.spawn(binaryPath, that.getBinaryArgs());
      that.tunnel.on('exit', function(){
        that.tunnel = undefined;
        if(that.exitCallback) that.exitCallback();
      });

      that.stdout = fs.openSync(that.logfile, 'r');
      var chunkSize = 512,
        buffer = new Buffer(81920),
        bytesRead = 0,
        error = undefined;

      while(true){
        var bytes = fs.readSync(that.stdout, buffer, bytesRead, chunkSize, bytesRead);
        if(bytes == 0) continue;

        var buffRead = buffer.slice(bytesRead, bytesRead+bytes);
        bytesRead += bytes;

        var data = buffRead.toString();

        if(data.match(that.errorRegex)){
          fs.closeSync(that.stdout);
          error = data.match(that.errorRegex)[0].trim();
          break;
        }

        if(data.match(that.doneRegex)){
          fs.closeSync(that.stdout);
          break;
        }
      }

      if(error) throw new LocalError(error);
      callback();
    });
  };

  this.isRunning = function(){
    return this.tunnel && running(this.tunnel.pid);
  };

  this.stop = function (callback) {
    if (this.tunnel) {
      if(callback) this.exitCallback = callback;
      this.tunnel.kill();
    }
    else if(callback) callback();
  };

  this.addArgs = function(options){
    for(var key in options){
      var value = options[key];

      switch(key){
      case 'key':
        this.key = value;
        break;

      case 'v':
        if(value)
          this.verboseFlag = '-vvv';
        break;

      case 'force':
        if(value)
          this.forceFlag = '-force';
        break;

      case 'only':
        if(value)
          this.onlyFlag = '-only';
        break;

      case 'onlyAutomate':
        if(value)
          this.onlyAutomateFlag = '-onlyAutomate';
        break;

      case 'forcelocal':
        if(value)
          this.forceLocalFlag = '-forcelocal';
        break;

      case 'localIdentifier':
        if(value)
          this.localIdentifierFlag = '-localIdentifier ' + value;
        break;

      case 'f':
        if(value){
          this.folderFlag = '-f';
          this.folderPath = value;
        }
        break;

      case 'proxyHost':
        if(value)
          this.proxyHost = '-proxyHost ' + value;
        break;

      case 'proxyPort':
        if(value)
          this.proxyPort = '-proxyPort ' + value;
        break;

      case 'proxyUser':
        if(value)
          this.proxyUser = '-proxyUser ' + value;
        break;

      case 'proxyPass':
        if(value)
          this.proxyPass = '-proxyPass ' + value;
        break;

      case 'forceproxy':
        if(value)
          this.forceProxyFlag = '-forceproxy';
        break;

      case 'hosts':
        if(value)
          this.hosts = value;
        break;

      case 'logfile':
        if(value)
          this.logfile = value;
        break;

      case 'binarypath':
        if(value)
          this.binaryPath = value;
        break;

      default:
        if(value.toString().toLowerCase() == 'true'){
          this.userArgs.push('-' + key);
        } else {
          this.userArgs.push('-' + key);
          this.userArgs.push(value);
        }
        break;
      }
    }
  };

  this.getBinaryPath = function(callback){
    if(typeof(this.binaryPath) == 'undefined'){
      this.binary = new LocalBinary();
      this.binary.binaryPath(callback);
    } else {
      callback(this.binaryPath);
    }
  };

  this.getBinaryArgs = function(){
    var args = ['-logFile', this.logfile];
    if(this.folderFlag)
      args.push(this.folderFlag);
    args.push(this.key);
    if(this.folderPath)
      args.push(this.folderPath);
    if(this.forceLocalFlag)
      args.push(this.forceLocalFlag);
    if(this.localIdentifierFlag)
      args.push(this.localIdentifierFlag);
    if(this.onlyFlag)
      args.push(this.onlyFlag);
    if(this.onlyAutomateFlag)
      args.push(this.onlyAutomateFlag);
    if(this.proxyHost)
      args.push(this.proxyHost);
    if(this.proxyPort)
      args.push(this.proxyPort);
    if(this.proxyUser)
      args.push(this.proxyUser);
    if(this.proxyPass)
      args.push(this.proxyPass);
    if(this.forceProxyFlag)
      args.push(this.forceProxyFlag);
    if(this.forceFlag)
      args.push(this.forceFlag);
    if(this.verboseFlag)
      args.push(this.verboseFlag);
    if(this.hosts)
      args.push(this.hosts);
    for(var i in this.userArgs){
      args.push(this.userArgs[i]);
    }
    return args;
  };
}

module.exports = Local;
