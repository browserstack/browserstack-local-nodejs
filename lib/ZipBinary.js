var path = require('path'),
  https = require('https'),
  unzip = require('unzip'),
  fs = require('fs'),
  log = require('./helper').log;

function ZipBinary(platform, arch, bin, ext) {
  var self = this;
  self.bin = (typeof(bin) == 'undefined' || bin == null || !bin.trim()) ? path.resolve(path.join(__dirname, '..', 'bin', arch ? path.join(platform, arch) : platform)) : bin;
  self.path = path.resolve(path.join(self.bin, 'BrowserStackLocal' + (ext ? '.' + ext : '')));
  self.command = self.path;
  self.args = [];

  self.update = function (callback) {
    var extractStream = unzip.Extract({
      path: self.bin
    });
    https.get('https://www.browserstack.com/browserstack-local/BrowserStackLocal-' + platform + (arch ? '-' + arch : '') + '.zip', function (response) {
      log.info('Downloading binary for ' + platform + (arch ? '-' + arch : '') + ' ...');
      extractStream.on('close', function () {
        log.info('Download complete');
        fs.chmod(self.path, '0755', callback);
      });
      response.pipe(extractStream);
    });
  };
}

module.exports = ZipBinary;
