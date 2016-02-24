var https = require('https'),
  unzip = require('unzip'),
  fs = require('fs'),
  path = require('path');

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
  const binaryName = 'BrowserStackLocal' + (platform === 'win32' ? '.exe' : '');

  this.args = [];

  var ensurePath = function (shouldFail) {
    var checkPath = '';
    try {
      checkPath = path.join(helper.getBinaryPath(), '..');
      fs.accessSync(checkPath, fs.R_OK | fs.W_OK);
    } catch(error) {
      log.warn('Cannot read/write to ' + checkPath);
      helper.fallbackBase();
      return ensurePath();
    }

    try {
      checkPath = helper.getBinaryPath();
      fs.accessSync(checkPath, fs.F_OK);
    } catch(error) {
      if (shouldFail) {
        log.warn('Download failed to ' + checkPath);
        helper.fallbackBase();
        return ensurePath();
      } else {
        log.warn('Binary file is not present at ' + checkPath);
        return true;
      }
    }

    try {
      fs.accessSync(checkPath, fs.R_OK | fs.W_OK | fs.X_OK);
    } catch(error) {
      try {
        log.warn('Adding execute permissions to ' + checkPath);
        fs.chmodSync(checkPath, '0755');
        fs.accessSync(checkPath, fs.X_OK);
      } catch(error) {
        log.warn('Cannot add execute permissions to ' + checkPath);
        helper.fallbackBase();
        return ensurePath();
      }
    }

    return false;
  };

  this.update = function (callback, shouldFail) {
    var self = this;
    var binaryPath = helper.getBinaryPath();
    var binaryDir = path.join(binaryPath, '..');
    if(ensurePath(shouldFail)) {
      var extractStream = unzip.Extract({
        path: binaryDir
      });
      https.get('https://www.browserstack.com/browserstack-local/BrowserStackLocal-' + platform + (arch ? '-' + arch : '') + '.zip', function (response) {
        log.info('Downloading binary for ' + platform + (arch ? '-' + arch : '') + ' ...');
        extractStream.on('close', function () {
          log.info('Download complete');
          fs.rename(path.join(binaryDir, binaryName), binaryPath, function() {
            fs.chmod(binaryPath, '0755', function() {
              self.update.apply(self, [ callback, true ]);
            });
          });
        });
        response.pipe(extractStream);
      });
    } else {
      callback();
    }
  };
}

module.exports = ZipBinary;
