var browserStackTunnel = require('./lib/browserStackTunnel');

function Local() {
  var tunnel = null;

  this.start = function(options, callback) {
    tunnel = new browserStackTunnel(options);
    if(callback == null) {
      callback = function() {};
    }
    tunnel.start(callback);
  };

  this.isRunning = function() {
    return (tunnel.state === 'started');
  };

  this.logs = function() {
  };

  this.stop = function(callback) {
    if(tunnel) {
      tunnel.stop(callback);
    }
  };
}

module.exports.Local = Local;
