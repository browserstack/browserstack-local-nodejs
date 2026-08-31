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
  var stubDir, bsLocal, uncaught, mochaListeners;

  function stub(name, body) {
    var stubPath = path.join(stubDir, name);
    fs.writeFileSync(stubPath, '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
    return stubPath;
  }

  // Drives start() with the given stub and collects every callback invocation.
  // The callback, any second (fall-through) invocation and any throw all come
  // out of the same synchronous execFile exithandler, so settling two ticks
  // after the first callback observes all of them deterministically — no
  // fixed sleep. The guard timer only fires if the callback never does (the
  // exact regression this suite exists to catch), so that failure mode shows
  // up as an assertion on calls.length instead of a mocha timeout.
  function run(stubPath, done) {
    var calls = [], finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      done(calls, uncaught);
    }

    var guard = setTimeout(finish, 5000);

    bsLocal.binaryPath = stubPath;
    bsLocal.start({ key: 'dummy-key', localIdentifier: 'loc-7325' }, function (error) {
      calls.push(error);
      setImmediate(function () { setImmediate(finish); });
    });
  }

  before(function () {
    stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-local-7325-'));
  });

  after(function () {
    if (!stubDir) return;
    if (fs.rmSync) fs.rmSync(stubDir, { recursive: true, force: true });
    else fs.rmdirSync(stubDir, { recursive: true });
  });

  beforeEach(function () {
    bsLocal = new browserstack.Local();
    // Keep the stubs from clobbering ./local.log in the repo root.
    bsLocal.logfile = path.join(stubDir, 'local.log');
    // Never enter the retry path: it deletes the stub, then downloads and
    // executes the real binary from the network.
    bsLocal.retriesLeft = 0;

    // Capture uncaughtExceptions for the duration of each test. Mocha's own
    // handler is snapshotted here and restored in afterEach, so restoration
    // survives a throwing test body.
    uncaught = [];
    mochaListeners = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');
    process.on('uncaughtException', function (err) { uncaught.push(err); });
  });

  afterEach(function () {
    process.removeAllListeners('uncaughtException');
    mochaListeners.forEach(function (listener) { process.on('uncaughtException', listener); });
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

  it('reports an error exactly once when the binary emits literal null', function (done) {
    this.timeout(10000);
    run(stub('null-output.sh', 'echo "null"; exit 0'), function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.match(/^Invalid output received: /);
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

  it('reports a fallback message when the payload message is not a string', function (done) {
    this.timeout(10000);
    run(stub('non-string-message.sh', 'echo \'{"state":"disconnected","message":42}\'; exit 0'), function (calls, uncaught) {
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

  it('surfaces the JSON diagnostic when the binary exits non-zero with a payload', function (done) {
    this.timeout(10000);
    run(stub('nonzero-with-payload.sh', 'echo \'{"state":"disconnected","message":{"message":"Invalid key"}}\'; exit 1'), function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.equal('Invalid key');
      done();
    });
  });

  it('startSync returns an error without deleting the binary on non-JSON output', function () {
    var stubPath = stub('sync-garbage.sh', 'echo "segmentation fault"; exit 0');
    bsLocal.binaryPath = stubPath;
    var err = bsLocal.startSync({ key: 'dummy-key', localIdentifier: 'loc-7325' });
    expect(err).to.be.an('object');
    expect(err.message).to.match(/^Invalid output received: /);
    // The old code misclassified parse failures as binary-execution failures
    // and deleted the binary before re-downloading it.
    expect(fs.existsSync(stubPath)).to.equal(true);
  });

  it('startSync returns an error when the binary emits literal null', function () {
    var stubPath = stub('sync-null.sh', 'echo "null"; exit 0');
    bsLocal.binaryPath = stubPath;
    var err = bsLocal.startSync({ key: 'dummy-key', localIdentifier: 'loc-7325' });
    expect(err).to.be.an('object');
    expect(err.message).to.match(/^Invalid output received: /);
  });

  it('truncates oversized non-JSON output attached to the error', function (done) {
    this.timeout(10000);
    // ~64KB of garbage; extra should be capped at 1KB plus a truncation note.
    run(stub('huge-output.sh', 'head -c 65536 /dev/zero | tr "\\0" "x"; exit 0'), function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.match(/^Invalid output received: /);
      expect(calls[0].extra.length).to.be.below(1100);
      expect(calls[0].extra).to.match(/\[truncated \d+ bytes\]$/);
      done();
    });
  });
});
