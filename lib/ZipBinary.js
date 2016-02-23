var https = require('https'),
  unzip = require('unzip'),
  fs = require('fs'),
  helper = require('./helper'),
  log = helper.log;

function ZipBinary(platform, arch) {
  this.command = helper.getBinaryPath();
  this.args = [];

  this.update = function (callback) {
    var extractStream = unzip.Extract({
      path: helper.getBasePath()
    });
    https.get('https://www.browserstack.com/browserstack-local/BrowserStackLocal-' + platform + (arch ? '-' + arch : '') + '.zip', function (response) {
      log.info('Downloading binary for ' + platform + (arch ? '-' + arch : '') + ' ...');
      extractStream.on('close', function () {
        log.info('Download complete');
        fs.chmod(helper.getBinaryPath(), '0755', callback);
      });
      response.pipe(extractStream);
    });
  };
}

module.exports = ZipBinary;
