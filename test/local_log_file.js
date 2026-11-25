var expect = require('expect.js'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    browserstack = require('../index');

// Regression tests for LOC-7743.
//
// On Windows the log path is wrapped in double quotes for the binary's command
// line. That quoted string was also handed to fs.writeFileSync to clear the
// previous log, and a path starting with `"` is resolved relative to the
// current directory, so the clear failed with ENOENT and the log was never
// emptied. These tests force the Windows quoting on any platform and check
// that the log is cleared while the `--log-file` argument keeps its quotes.
//
// Stubs are shell scripts, so these are skipped on Windows.
describe('Local log file', function () {
  var tmpDir, logPath, bsLocal, clearErrors, originalConsoleError;

  // What os.platform().match(...) yields on Windows; truthy is all that matters.
  var WINDOWS = ['win32'];

  function stub(name, body) {
    var stubPath = path.join(tmpDir, name);
    fs.writeFileSync(stubPath, '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
    return stubPath;
  }

  function logFileArg(local) {
    var args = local.getBinaryArgs();
    return args[args.indexOf('--log-file') + 1];
  }

  before(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-local-7743-'));
  });

  beforeEach(function () {
    logPath = path.join(tmpDir, 'local.log');
    fs.writeFileSync(logPath, 'previous run log line\n');
    bsLocal = new browserstack.Local();
    clearErrors = [];
    originalConsoleError = console.error;
    console.error = function () {
      var line = Array.prototype.join.call(arguments, ' ');
      if (/Could not clear log file/.test(line)) clearErrors.push(line);
    };
  });

  afterEach(function () {
    console.error = originalConsoleError;
  });

  if (os.platform().match(/win32/i)) {
    it.skip('skipped on Windows (stub binaries are shell scripts)');
    return;
  }

  it('startSync clears the log file when the path is quoted for Windows', function () {
    bsLocal.windows = WINDOWS;
    bsLocal.startSync({ key: 'dummy-key', logFile: logPath, binarypath: stub('no-output.sh', 'exit 0') });

    expect(clearErrors).to.eql([]);
    expect(fs.readFileSync(logPath, 'utf8')).to.equal('');
  });

  it('start clears the log file when the path is quoted for Windows', function (done) {
    this.timeout(10000);
    bsLocal.windows = WINDOWS;
    bsLocal.start({ key: 'dummy-key', logFile: logPath, binarypath: stub('no-output.sh', 'exit 0') }, function () {
      expect(clearErrors).to.eql([]);
      expect(fs.readFileSync(logPath, 'utf8')).to.equal('');
      done();
    });
  });

  it('keeps passing the quoted path to the binary on Windows', function () {
    bsLocal.windows = WINDOWS;
    bsLocal.addArgs({ logFile: logPath });

    expect(logFileArg(bsLocal)).to.equal('"' + logPath + '"');
  });

  it('does not double-quote a path that is already quoted', function () {
    bsLocal.windows = WINDOWS;
    bsLocal.addArgs({ logFile: '"' + logPath + '"' });

    expect(logFileArg(bsLocal)).to.equal('"' + logPath + '"');
  });

  it('passes the path unquoted to the binary on other platforms', function () {
    bsLocal.windows = null;
    bsLocal.addArgs({ logFile: logPath });

    expect(logFileArg(bsLocal)).to.equal(logPath);
  });
});
