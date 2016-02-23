var https = require('https'),
  unzip = require('unzip'),
  fs = require('fs');

function ZipBinary(helper) {
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

  var ensurePath = function () {
    try {
      fs.accessSync(helper.getBasePath(), fs.R_OK | fs.W_OK);
    } catch(error) {
      log.warn('Cannot read/write to ' + helper.getBasePath());
      helper.fallbackBase();
      return ensurePath();
    }

    try {
      fs.accessSync(helper.getBinaryPath(), fs.F_OK);
    } catch(error) {
      log.warn('Binary file is not present at ' + helper.getBinaryPath());
      return true;
    }

    try {
      fs.accessSync(helper.getBinaryPath(), fs.R_OK | fs.W_OK | fs.X_OK);
    } catch(error) {
      try {
        log.warn('Adding execute permissions to ' + helper.getBinaryPath());
        fs.chmodSync(helper.getBinaryPath(), '0755');
        fs.accessSync(helper.getBinaryPath(), fs.X_OK);
      } catch(error) {
        log.warn('Cannot add execute permissions to ' + helper.getBasePath());
        helper.fallbackBase();
        return ensurePath();
      }
    }

    return false;
  };

  this.update = function (callback) {
    if(ensurePath()) {
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
    } else {
      callback();
    }
  };
}

module.exports = ZipBinary;
