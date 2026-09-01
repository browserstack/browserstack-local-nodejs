var expect = require('expect.js'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    running = require('is-running'),
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
// Throws are observed via process.on('uncaughtExceptionMonitor'), which sees
// every uncaught exception WITHOUT detaching mocha's own handler: a regression
// fails the test with the real thrown error instead of a bare timeout, and no
// unrelated error is ever swallowed.
//
// Stubs are shell scripts, so these are skipped on Windows.
describe('Local.start output handling', function () {
  var stubDir, bsLocal, uncaught, monitorListener;

  function stub(name, body) {
    var stubPath = path.join(stubDir, name);
    fs.writeFileSync(stubPath, '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
    return stubPath;
  }

  // Drives start() with the given stub, then hands every callback invocation
  // plus the uncaught array to `assert`. The callback, any second
  // (fall-through) invocation and any throw all come out of the same
  // synchronous execFile exithandler, so settling two ticks after the first
  // callback observes all of them deterministically — no fixed sleep. The
  // guard timer only fires if the callback never does, so that failure mode
  // shows up as an assertion on calls.length instead of a mocha timeout.
  // Assertion failures are routed to mocha's done, never left to throw
  // asynchronously.
  function run(stubPath, done, assert) {
    var calls = [], finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      try {
        assert(calls, uncaught);
        done();
      } catch (assertionError) {
        done(assertionError);
      }
    }

    var guard = setTimeout(finish, 5000);

    bsLocal.binaryPath = stubPath;
    bsLocal.start({ key: 'dummy-key', localIdentifier: 'loc-7325' }, function (error) {
      calls.push(error);
      setImmediate(function () { setImmediate(finish); });
    });
  }

  // A pid that is definitely not running, so the liveness check has something
  // deterministic to reject. Scans down from a high pid rather than hardcoding
  // one, since any fixed pid may happen to be live on the test machine.
  function findDeadPid() {
    for (var candidate = 4194303; candidate > 4194000; candidate--) {
      if (!running(candidate)) return candidate;
    }
    throw new Error('could not find an unused pid');
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

    uncaught = [];
    monitorListener = function (err) { uncaught.push(err); };
    process.on('uncaughtExceptionMonitor', monitorListener);
  });

  afterEach(function () {
    process.removeListener('uncaughtExceptionMonitor', monitorListener);
  });

  if (os.platform().match(/win32/i)) {
    it.skip('skipped on Windows (stub binaries are shell scripts)');
    return;
  }

  it('reports an error exactly once when the binary exits with no output', function (done) {
    this.timeout(10000);
    run(stub('empty-output.sh', 'exit 0'), done, function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0]).to.be.an('object');
      expect(calls[0].message).to.equal('No output received');
    });
  });

  it('reports an error exactly once when the binary emits non-JSON output', function (done) {
    this.timeout(10000);
    run(stub('garbage-output.sh', 'echo "segmentation fault"; exit 0'), done, function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.match(/^Invalid output received: /);
      expect(calls[0].extra).to.match(/segmentation fault/);
    });
  });

  it('reports an error exactly once when the binary emits literal null', function (done) {
    this.timeout(10000);
    run(stub('null-output.sh', 'echo "null"; exit 0'), done, function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.match(/^Invalid output received: /);
    });
  });

  it('reports a fallback message when a non-connected payload has no message key', function (done) {
    this.timeout(10000);
    run(stub('no-message-key.sh', 'echo \'{"state":"disconnected"}\'; exit 0'), done, function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.equal('Failed to start BrowserStack Local');
    });
  });

  it('reports a fallback message when the payload message is not a string', function (done) {
    this.timeout(10000);
    run(stub('non-string-message.sh', 'echo \'{"state":"disconnected","message":42}\'; exit 0'), done, function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.equal('Failed to start BrowserStack Local');
    });
  });

  it('surfaces the binary message when a non-connected payload carries one', function (done) {
    this.timeout(10000);
    run(stub('with-message.sh', 'echo \'{"state":"disconnected","message":{"message":"Invalid key"}}\'; exit 0'), done, function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.equal('Invalid key');
    });
  });

  it('surfaces the JSON diagnostic when the binary exits non-zero with a payload', function (done) {
    this.timeout(10000);
    run(stub('nonzero-with-payload.sh', 'echo \'{"state":"disconnected","message":{"message":"Invalid key"}}\'; exit 1'), done, function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.equal('Invalid key');
    });
  });

  it('keeps crash output as extra when the binary exits non-zero with non-JSON output', function (done) {
    this.timeout(10000);
    run(stub('nonzero-garbage.sh', 'echo "segmentation fault"; exit 139'), done, function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.match(/Command failed/);
      expect(calls[0].extra).to.match(/segmentation fault/);
    });
  });

  it('treats a connected payload as success even when the process exits non-zero', function (done) {
    this.timeout(10000);
    // Uses this process's own pid so the daemon is genuinely alive; the
    // success path requires the reported pid to actually be running.
    var live = process.pid;
    run(stub('connected-then-fail.sh', 'echo \'{"state":"connected","pid":' + live + '}\'; exit 1'), done, function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      // The daemon is up despite the foreground exit status; reporting an
      // error here left isRunning() true while start() claimed failure.
      expect(calls[0]).to.equal(undefined);
      expect(bsLocal.pid).to.equal(live);
      expect(bsLocal.isProcessRunning).to.equal(true);
    });
  });

  it('does not report success when a connected payload names a dead pid', function (done) {
    this.timeout(10000);
    // A payload can claim 'connected' from a daemon that has already died.
    // Without a liveness check start() called back with no error and left
    // isProcessRunning true, so the caller ran its whole suite against a
    // dead tunnel and failed later with an unrelated error.
    var dead = findDeadPid();
    run(stub('connected-dead-pid.sh', 'echo \'{"state":"connected","pid":' + dead + '}\'; exit 1'), done, function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0]).to.be.an('object');
      expect(calls[0].message).to.match(/Command failed/);
      expect(bsLocal.isProcessRunning).to.equal(false);
    });
  });

  it('keeps the unparsed payload as extra when a non-zero exit has an unusable message', function (done) {
    this.timeout(10000);
    run(stub('nonzero-bad-message.sh', 'echo \'{"state":"disconnected","message":42}\'; exit 1'), done, function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.match(/Command failed/);
      expect(calls[0].extra).to.match(/"message":42/);
    });
  });

  it('startSync keeps a user-supplied binary on non-JSON output', function () {
    var stubPath = stub('sync-garbage.sh', 'echo "segmentation fault"; exit 0');
    var err = bsLocal.startSync({ key: 'dummy-key', localIdentifier: 'loc-7325', binarypath: stubPath });
    expect(err).to.be.an('object');
    expect(err.message).to.match(/^Invalid output received: /);
    // The old code misclassified parse failures as binary-execution failures
    // and deleted the binary (even a user-supplied one) before re-downloading.
    expect(fs.existsSync(stubPath)).to.equal(true);
  });

  it('startSync evicts a downloaded binary that prints non-JSON output, without retrying', function () {
    var stubPath = stub('sync-garbage-evict.sh', 'echo "segmentation fault"; exit 0');
    bsLocal.binaryPath = stubPath; // simulates a previously downloaded binary
    var err = bsLocal.startSync({ key: 'dummy-key', localIdentifier: 'loc-7325' });
    expect(err).to.be.an('object');
    expect(err.message).to.match(/^Invalid output received: /);
    // Corrupt-but-runnable downloads self-heal on the NEXT start via a fresh
    // download, instead of the old delete-and-retry-9-times loop.
    expect(fs.existsSync(stubPath)).to.equal(false);
  });

  it('startSync returns an error when the binary emits literal null', function () {
    var stubPath = stub('sync-null.sh', 'echo "null"; exit 0');
    bsLocal.binaryPath = stubPath;
    var err = bsLocal.startSync({ key: 'dummy-key', localIdentifier: 'loc-7325' });
    expect(err).to.be.an('object');
    expect(err.message).to.match(/^Invalid output received: /);
  });

  // A user-supplied binary is not ours to delete, and re-downloading cannot
  // help: addArgs re-applies the `binarypath` option on every retry, so the
  // retry re-execs the file we just deleted, burns the whole retry budget and
  // replaces the real diagnostic with ENOENT. See LOC-7325.
  it('never deletes a user-supplied binary when the exec fails', function (done) {
    this.timeout(10000);
    var stubPath = stub('user-binary-crash.sh', 'echo "boom" >&2; exit 3');
    var local = new browserstack.Local();
    local.logfile = path.join(stubDir, 'local.log');
    local.retriesLeft = 9;

    local.start({ key: 'dummy-key', binarypath: stubPath }, function (error) {
      try {
        expect(local.userProvidedBinaryPath).to.equal(true);
        expect(fs.existsSync(stubPath)).to.equal(true);
        // The real crash text survives instead of the ENOENT the deletion
        // used to produce, and the retry budget is untouched.
        expect(error.message).to.match(/boom/);
        expect(local.retriesLeft).to.equal(9);
        done();
      } catch (assertionError) {
        done(assertionError);
      }
    });
  });

  it('startSync never deletes a user-supplied binary when the exec fails', function () {
    // Not executable, so spawnSync fails outright (EACCES) and startSync
    // enters its retry path — the branch that used to unlink the binary.
    // A non-zero exit alone would not reach it.
    var stubPath = stub('user-binary-crash-sync.sh', 'exit 3');
    fs.chmodSync(stubPath, 0o644);
    var local = new browserstack.Local();
    local.logfile = path.join(stubDir, 'local.log');
    local.retriesLeft = 9;

    var threw = null;
    var error;
    try {
      error = local.startSync({ key: 'dummy-key', binarypath: stubPath });
    } catch (e) {
      threw = e;
    }

    expect(fs.existsSync(stubPath)).to.equal(true);
    expect(local.retriesLeft).to.equal(9);
    expect(threw || error).to.be.an('object');
  });

  // LocalBinary.getAvailableDirs() throws synchronously when none of the
  // candidate directories is writable (locked-down CI containers). That throw
  // used to escape start() with the callback never fired at all — the same
  // "caller never hears back" class this suite exists to close.
  it('routes a synchronous binary-path failure to the callback', function (done) {
    this.timeout(10000);
    var local = new browserstack.Local();
    local.logfile = path.join(stubDir, 'local.log');
    local.getBinaryPath = function () {
      throw new Error('Error trying to download BrowserStack Local binary');
    };

    var calls = [];
    local.start({ key: 'dummy-key' }, function (error) { calls.push(error); });

    setImmediate(function () {
      try {
        expect(calls.length).to.equal(1);
        expect(calls[0].message).to.match(/Error trying to download BrowserStack Local binary/);
        done();
      } catch (assertionError) {
        done(assertionError);
      }
    });
  });

  it('startSync returns a synchronous binary-path failure as an error', function () {
    var local = new browserstack.Local();
    local.logfile = path.join(stubDir, 'local.log');
    local.getBinaryPath = function () {
      throw new Error('Error trying to download BrowserStack Local binary');
    };

    var error = local.startSync({ key: 'dummy-key' });
    expect(error).to.be.an('object');
    expect(error.message).to.match(/Error trying to download BrowserStack Local binary/);
  });

  it('truncates oversized non-JSON output attached to the error', function (done) {
    this.timeout(10000);
    // ~64KB of garbage; extra should be capped at 1KB plus a truncation note.
    run(stub('huge-output.sh', 'head -c 65536 /dev/zero | tr "\\0" "x"; exit 0'), done, function (calls, uncaught) {
      expect(uncaught).to.eql([]);
      expect(calls.length).to.equal(1);
      expect(calls[0].message).to.match(/^Invalid output received: /);
      expect(calls[0].extra.length).to.be.below(1100);
      expect(calls[0].extra).to.match(/\[truncated \d+ bytes\]$/);
    });
  });
});
