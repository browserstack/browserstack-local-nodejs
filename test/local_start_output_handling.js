var expect = require('expect.js'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    browserstack = require('../index');

// Regression tests for LOC-7325.
//
// `Local.start` handles the binary's output inside an `execFile` callback. A
// throw there is raised by node's internal exithandler, so no try/catch around
// `start()` can intercept it — it surfaces as an uncaughtException and the
// blast radius is set by the host process's exception policy. These tests drive
// `start()` with stub binaries that reproduce each output shape and assert the
// callback fires exactly once with an error, and that nothing throws.
//
// Stubs are shell scripts, so these are skipped on Windows.
describe('Local.start output handling', function () {
  var stubDir, bsLocal;

  function stub(name, body) {
    var stubPath = path.join(stubDir, name);
    fs.writeFileSync(stubPath, '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
    return stubPath;
  }

  // Drives start() with the given stub and collects every callback invocation
  // plus any uncaughtException raised out of the execFile callback.
  function run(stubPath, done) {
    var calls = [], uncaught = [];
    var existing = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');
    process.on('uncaughtException', function (err) { uncaught.push(err); });

    bsLocal.binaryPath = stubPath;
    bsLocal.start({ key: 'dummy-key', localIdentifier: 'loc-7325' }, function (error) {
      calls.push(error);
    });

    // Settle past the execFile callback before asserting, so a second
    // (throwing) invocation would have happened by now if it were going to.
    setTimeout(function () {
      process.removeAllListeners('uncaughtException');
      existing.forEach(function (listener) { process.on('uncaughtException', listener); });
      done(calls, uncaught);
    }, 1000);
  }

  before(function () {
    stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-local-7325-'));
  });

  beforeEach(function () {
    bsLocal = new browserstack.Local();
    // Keep the stubs from clobbering ./local.log in the repo root.
    bsLocal.logfile = path.join(stubDir, 'local.log');
  });

  if (os.platform().match(/win32/i)) {
    it.skip('skipped on Windows (stub binaries are shell scripts)');
    return;
  }

  it('reports an error exactly once when the binary exits with no output', function (done) {
    this.timeout(10000);
    run(stub('empty-output.sh', 'exit 0'), function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0]).to.be.an('object');
      expect(calls[0].message).to.equal('No output received');
      done();
    });
  });

  it('reports an error exactly once when the binary emits non-JSON output', function (done) {
    this.timeout(10000);
    run(stub('garbage-output.sh', 'echo "segmentation fault"; exit 0'), function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.match(/^Invalid output received: /);
      expect(calls[0].extra).to.match(/segmentation fault/);
      done();
    });
  });

  it('reports a fallback message when a non-connected payload has no message key', function (done) {
    this.timeout(10000);
    run(stub('no-message-key.sh', 'echo \'{"state":"disconnected"}\'; exit 0'), function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.equal('Failed to start BrowserStack Local');
      done();
    });
  });

  it('surfaces the binary message when a non-connected payload carries one', function (done) {
    this.timeout(10000);
    run(stub('with-message.sh', 'echo \'{"state":"disconnected","message":{"message":"Invalid key"}}\'; exit 0'), function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.equal('Invalid key');
      done();
    });
  });
});
