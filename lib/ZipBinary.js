var https = require('https'),
  unzip = require('unzip'),
  fs = require('fs'),
  Helper = require('./helper');

function ZipBinary() {
  var helper = new Helper.helper();
  var log = helper.log;

  var platform = helper.getPlatform();
  var arch = helper.getArch();
  if (platform === 'darwin') {
    arch = 'x64';
  } else if (platform !== 'linux' && platform !== 'darwin') {
    platform = 'win32';
    arch = null;
  }

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
