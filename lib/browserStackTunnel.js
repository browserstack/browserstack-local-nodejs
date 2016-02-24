var childProcess = require('child_process'),
  fs = require('fs'),
  ZipBinary = require('./ZipBinary'),
  Helper = require('./helper'),
  Tail = require('tail').Tail;

function BrowserStackTunnel(options) {
  var helper = new Helper.helper();
  var log = helper.log;

  if (options.binaryPath) {
    helper.setBinaryPath(options.binaryPath);
  }
  if (options.logfile) {
    helper.setLogFilePath(options.logfile);
  }

  var params = [],
    startCallback = null,
    stopCallback = null,
    doneStart = function(params) {
      if(startCallback !== null) {
        startCallback(params);
      }
    },
    doneStop = function(params) {
      if (this.tail) {
        this.tail.unwatch();
        this.tail = null;
      }
      if(stopCallback) {
        stopCallback(params);
      }
    };

  var binary = new ZipBinary(helper);

  this.stdoutData = '';
  this.tunnel = null;
  this.tail = null;

  if (options.hosts) {
    params.push(options.hosts);
  }

  if (options.localIdentifier) {
    params.push('-localIdentifier', options.localIdentifier);
  }

  if (options.verbose) {
    params.push('-vvv');
  }

  if (options.f) {
    options.folder = options.f;
  }

  if (options.force) {
    params.push('-force');
  }

  if (options.forcelocal) {
    params.push('-forcelocal');
  }

  if (options.only) {
    params.push('-only');
  }

  if (options.onlyAutomate) {
    params.push('-onlyAutomate');
  }

  if (options.proxyHost) {
    params.push('-proxyHost', options.proxyHost);
  }

  if (options.proxyPort) {
    params.push('-proxyPort', options.proxyPort);
  }

  if (options.proxyUser) {
    params.push('-proxyUser', options.proxyUser);
  }

  if (options.proxyPass) {
    params.push('-proxyPass', options.proxyPass);
  }

  if (options.key == null || !options.key.trim()) {
    options.key = process.env.BROWSERSTACK_ACCESS_KEY;
  }

  this.state = 'stop';
  this.stateMatchers = {
    'already_running': new RegExp('\\*\\*Error: There is another JAR already running'),
    'invalid_key': new RegExp('\\*\\*Error: You provided an invalid key'),
    'connection_failure': new RegExp('\\*\\*Error: Could not connect to server'),
    'newer_available': new RegExp('There is a new version of BrowserStackTunnel.jar available on server'),
    'started': new RegExp('Press Ctrl-C to exit')
  };

  this.updateState = function (data) {
    var state;
    this.stdoutData += data.toString();
    for (state in this.stateMatchers) {
      if (this.stateMatchers.hasOwnProperty(state) && this.stateMatchers[state].test(this.stdoutData) && this.state !== state) {
        this.state = state;
        switch(state) {
        case('newer_available'):
          log.warn('BrowserStackTunnel: binary out of date');
          this.killTunnel();
          var self = this;
          binary.update(function () {
            self.startTunnel();
          });
          break;
        case('invalid_key'):
          doneStart(new Error('Invalid key'));
          break;
        case('connection_failure'):
          doneStart(new Error('Could not connect to server'));
          break;
        case('already_running'):
          doneStart(new Error('child already started'));
          break;
        default:
          doneStart();
          break;
        }
        break;
      }
    }
  };

  this.killTunnel = function () {
    if (this.tunnel) {
      this.tunnel.stdout.removeAllListeners('data');
      this.tunnel.stderr.removeAllListeners('data');
      this.tunnel.removeAllListeners('error');
      this.tunnel.kill();
      this.tunnel = null;
    }
    if (this.tail) {
      this.tail.unwatch();
      this.tail = null;
    }
  };

  this.exit = function () {
    if (this.state !== 'started' && this.state !== 'newer_available') {
      doneStart(new Error('child failed to start:\n' + this.stdoutData));
    } else if (this.state !== 'newer_available') {
      this.state = 'stop';
      doneStop();
    }
  };

  this.cleanUp = function () {
    this.stdoutData = '';
  };

  this._startTunnel = function () {
    var binaryPath = helper.getBinaryPath();
    this.cleanUp();

    var logFilePath = helper.getLogFilePath();
    params.push('-logFile', logFilePath);

    // Ensure log file is present
    fs.open(logFilePath, 'wx', function() {});

    log.info('Local Binary is located at ' + binaryPath);
    log.info('Log file is located at ' + logFilePath);

    try {
      this.tail = new Tail(logFilePath);
    } catch(e) {
      throw new Error('Cannot access log file path - ' + logFilePath);
    }
    this.tail.on('line', this.updateState.bind(this));
    this.tail.on('error', this.updateState.bind(this));

    var binaryArguments = '';
    if (options.folder) {
      binaryArguments = binary.args.concat(['-f', options.key, options.folder]).concat(params);
    } else {
      binaryArguments = binary.args.concat([options.key]).concat(params);
    }
    log.info('Local started with args: ' + JSON.stringify(binaryArguments).replace(options.key, '<access_key>'));
    this.tunnel = childProcess.spawn(binaryPath, binaryArguments);
    this.tunnel.stdout.on('data', this.updateState.bind(this));
    this.tunnel.stderr.on('data', this.updateState.bind(this));
    this.tunnel.on('error', this.killTunnel.bind(this));
    this.tunnel.on('exit', this.exit.bind(this));
  };

  this.startTunnel = function () {
    var self = this;
    var binaryPath = helper.getBinaryPath();
    log.info('Checking binary location ' + binaryPath);
    binary.update(function () {
      try {
        self._startTunnel();
      } catch(e) {
        if (e.message.toLowerCase().match(/cannot access log file path/)) {
          throw new Error('Cannot Access log file path. Please check write permissions.');
        }
        log.warn('The downloaded binary might be corrupt. Retrying download');
        binary.update(function () {
          self._startTunnel();
        });
      }
    });
  };

  this.start = function (callback) {
    startCallback = callback;
    if (this.state === 'started') {
      doneStart(new Error('child already started'));
    } else {
      this.startTunnel();
    }
  };

  this.stop = function (callback) {
    if (this.state !== 'stop') {
      stopCallback = callback;
    } else if (this.state !== 'started') {
      var err = new Error('child not started');
      if (this.tail) {
        this.tail.unwatch();
        this.tail = null;
      }
      callback(err);
    }

    this.killTunnel();
  };
}

module.exports = BrowserStackTunnel;
