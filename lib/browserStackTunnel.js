var fs = require('fs'),
  childProcess = require('child_process'),
  ZipBinary = require('./ZipBinary'),
  Helper = require('./helper');

function BrowserStackTunnel(options) {
  var helper = new Helper.helper();
  var log = helper.log;

  if (options.path) {
    helper.setBasePath(options.path);
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
      if(stopCallback !== null) {
        stopCallback(params);
      }
    };

  var binary = new ZipBinary();

  this.stdoutData = '';
  this.tunnel = null;

  if (options.hosts) {
    params.push(options.hosts);
  }

  if (options.localIdentifier) {
    params.push('-localIdentifier', options.localIdentifier);
  }

  if (options.verbose) {
    params.push('-vvv');
  }

  if (options.force) {
    params.push('-force');
  }

  if (options.forcelocal) {
    params.push('-forcelocal');
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
    helper.logBinaryOutput(data.toString());
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
    this.cleanUp();
    log.info('Local started with args: ' + JSON.stringify(params));
    this.tunnel = childProcess.spawn(helper.getBinaryPath(), binary.args.concat([options.key]).concat(params));
    this.tunnel.stdout.on('data', this.updateState.bind(this));
    this.tunnel.stderr.on('data', this.updateState.bind(this));
    this.tunnel.on('error', this.killTunnel.bind(this));
    this.tunnel.on('exit', this.exit.bind(this));
  };

  this.startTunnel = function () {
    var self = this;
    if (!fs.existsSync(helper.getBinaryPath())) {
      log.warn('Binary not present');
      binary.update(function () {
        self._startTunnel();
      });
    } else {
      try {
        this._startTunnel();
      }catch(e) {
        log.warn('The downloaded binary might be corrupt. Retrying download');
        binary.update(function () {
          self._startTunnel();
        });
      }
    }
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
      callback(err);
    }

    this.killTunnel();
  };
}

module.exports = BrowserStackTunnel;
