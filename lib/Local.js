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

// Option keys this wrapper is allowed to forward verbatim to the
// BrowserStackLocal daemon. Mirrors the binary's own CLI definition
// (COMMAND_CONFIGURATION in browserStackTunnel, extensions/node/config/constants.js)
// — long names and their aliases — so every documented modifier keeps working
// while an unrecognised key can no longer reach the daemon argv.
var PASSTHROUGH_OPTIONS = [
  'key', 'folder', 'help', 'version', 'force', 'only',
  'forcelocal', 'force-local',
  'verbose',
  'onlyAutomate', 'only-automate',
  'proxyHost', 'proxy-host',
  'proxyPort', 'proxy-port',
  'proxyUser', 'proxy-user',
  'proxyPass', 'proxy-pass',
  'localIdentifier', 'local-identifier',
  'forceproxy', 'force-proxy',
  'region',
  'localProxyHost', 'local-proxy-host',
  'localProxyPort', 'local-proxy-port',
  'localProxyUser', 'local-proxy-user',
  'localProxyPass', 'local-proxy-pass',
  'enableLoggingForAPI', 'enable-logging-for-api',
  'logFile',
  'pacFile', 'pac-file',
  'parallelRuns', 'parallel-runs',
  'disableProxyDiscovery', 'disable-proxy-discovery',
  'enableUTCLogging', 'enable-utc-logging',
  'no-container',
  'include-hosts', 'exclude-hosts',
  'bsHost', 'bs-host',
  'debug-utility', 'debug-url',
  'customRepeater', 'custom-repeater',
  'enterprise',
  'use-system-installed-ca', 'use-ca-certificate',
  'https-ports',
  'ntlm-username', 'ntlm-password', 'ntlm-domain', 'ntlm-workstation',
  'connect-timeout',
  'public-interface-services',
  'disableDashboard', 'disable-dashboard',
  'config-file',
  'client-protocol',
  'identifier',
  'trusted-hosts'
];

// Flags getBinaryArgs() always puts on the argv itself. Accepting them from
// the options object too would let a caller append a second, conflicting copy
// — e.g. '--daemon stop' after our '--daemon start'. ('logFile' has its own
// supported option; only the raw binary alias is reserved.)
var RESERVED_OPTIONS = ['daemon', 'log-file', 'source'];

// Keys consumed by this wrapper and never meant for the binary.
var INTERNAL_OPTIONS = ['onlyCommand'];

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
    const argsError = this.addArgs(options);
    if(argsError)
      return argsError;

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
      this.tunnel = {pid: obj.pid};
      var data = {};
      if(obj.stdout.length > 0)
        data = JSON.parse(obj.stdout);
      else if(obj.stderr.length > 0)
        data = JSON.parse(obj.stderr);
      else
        return new LocalError('No output received');
      if(data['state'] != 'connected'){
        return new LocalError(data['message']['message']);
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
        fs.unlinkSync(that.binaryPath);
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
    const argsError = this.addArgs(options);
    if(argsError)
      return callback(argsError);

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
        if(error) {
          const binaryDownloadErrorMessage = `Error while trying to execute binary: ${util.format(error)}`;
          console.error(binaryDownloadErrorMessage);
          if(that.retriesLeft > 0) {
            console.log('Retrying Binary Download. Retries Left', that.retriesLeft);
            that.retriesLeft -= 1;
            fs.unlinkSync(that.binaryPath);
            delete(that.binaryPath);
            process.env.BINARY_DOWNLOAD_ERROR_MESSAGE = binaryDownloadErrorMessage;
            process.env.BINARY_DOWNLOAD_FALLBACK_ENABLED = true;
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
          that.isProcessRunning = true;
          callback();
        }
      });
    }, options['bs-host']);
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

      default: {
        var error = this.addUserArg(key, value);
        if(error)
          return error;
        break;
      }
      }
    }
  };

  // Forwards one caller-supplied option to the daemon argv, or returns a
  // LocalError describing why it was refused. Only documented modifiers get
  // through: an unknown key used to be prefixed with '--' and pushed blindly,
  // which let any caller inject arbitrary flags into the native binary.
  this.addUserArg = function(key, value){
    if(INTERNAL_OPTIONS.indexOf(key) !== -1)
      return;

    if(RESERVED_OPTIONS.indexOf(key) !== -1)
      return new LocalError('Option \'' + key + '\' is set by browserstack-local itself and cannot be passed in');

    if(PASSTHROUGH_OPTIONS.indexOf(key) === -1)
      return new LocalError('Unknown option \'' + key + '\'. Only documented BrowserStack Local modifiers are forwarded to the binary, see https://www.browserstack.com/local-testing#modifiers');

    var stringValue = value === undefined || value === null ? '' : value.toString();

    if(stringValue.toLowerCase() == 'true'){
      this.userArgs.push('--' + key);
      return;
    }

    // The binary's argv parser will not consume a value that begins with '-';
    // it reads it as another flag instead. Refuse rather than smuggle one in.
    if(stringValue.charAt(0) === '-')
      return new LocalError('Invalid value for option \'' + key + '\': values starting with \'-\' are not allowed');

    this.userArgs.push('--' + key);
    this.userArgs.push(value);
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
