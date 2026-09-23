var expect = require('expect.js'),
    childProcess = require('child_process'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    LocalBinary = require('../lib/LocalBinary'),
    browserstack = require('../index');

// Regression tests for LOC-7420.
//
// On Windows `BrowserStackLocal.exe` in ~/.browserstack is routinely
// unopenable for a moment — an AV scan of a freshly written executable, a
// tunnel still releasing its handle, two workers starting at once — and the
// open fails with EBUSY/EPERM. Two defects turned that transient condition
// into a hard failure:
//
//   1. `download.js` attached its write-stream 'error' handler inside the
//      async https.get callback, so the open failure arrived with no listener
//      and node killed the download child with an unhandled 'error'.
//   2. `retryBinaryDownload` did its work inside an async callback, so on the
//      sync path it returned undefined to a caller that had already given up —
//      surfacing as "Couldn't find binary file" while the retries carried on,
//      orphaned, in the background.
//
// Neither needs Windows to reproduce: (1) is any createWriteStream failure,
// and (2) is platform-independent.
describe('LocalBinary busy-binary download handling', function () {

  describe('retryBinaryDownload', function () {
    it('returns the retry result to the caller on the sync path', function () {
      var binary = new LocalBinary(),
          expected = path.join(os.tmpdir(), 'BrowserStackLocal-fake'),
          calls = 0;

      // First attempt fails and retries; the retry succeeds. Before the fix
      // the returned value was lost in the async callback.
      binary.downloadSync = function (conf, dest, retries) {
        calls += 1;
        if (calls === 1) {
          return binary.retryBinaryDownload(conf, dest, null, retries, path.join(os.tmpdir(), 'bs-local-absent'));
        }
        return expected;
      };

      expect(binary.downloadSync({}, os.tmpdir(), 9)).to.equal(expected);
      expect(calls).to.equal(2);
    });

    it('stops at the retry ceiling instead of recursing', function () {
      var binary = new LocalBinary(), calls = 0;
      binary.downloadSync = function (conf, dest, retries) {
        calls += 1;
        return binary.retryBinaryDownload(conf, dest, null, retries, path.join(os.tmpdir(), 'bs-local-absent'));
      };

      // One initial attempt plus `retries` further ones, then a clean stop.
      expect(binary.downloadSync({}, os.tmpdir(), 3)).to.be(undefined);
      expect(calls).to.equal(4);
    });
  });

  describe('async download completion', function () {
    // The callback contract has to be completed on every path, or
    // Local.start() waits on a callback that never arrives.
    it('completes the callback when retries are exhausted', function (done) {
      var binary = new LocalBinary();
      binary.retryBinaryDownload({}, os.tmpdir(), function (binaryPath) {
        expect(binaryPath).to.be(undefined);
        done();
      }, 0, path.join(os.tmpdir(), 'bs-local-absent'));
    });

    // node emits 'close' after 'error', so a failed attempt used to report
    // success through the close handler as well as retrying.
    it('reports a failed attempt once, not alongside a success', function (done) {
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-local-')),
          target = path.join(dir, 'BrowserStackLocal'),
          calls = [];
      fs.mkdirSync(target);

      var binary = new LocalBinary();
      binary.getDownloadPath = function (conf, retries, cb) {
        cb(null, 'https://127.0.0.1:1/BrowserStackLocal');
      };
      binary.download({}, dir, function (binaryPath) { calls.push(binaryPath); }, 0);

      setTimeout(function () {
        expect(calls.length).to.equal(1);
        expect(calls[0]).to.be(undefined);
        fs.rmdirSync(target);
        fs.rmdirSync(dir);
        done();
      }, 1500);
    });
  });

  describe('source url failure', function () {
    it('completes the callback when the download url cannot be fetched', function (done) {
      var binary = new LocalBinary();
      binary.getDownloadPath = function (conf, retries, cb) { cb(new Error('invalid key')); };
      binary.download({}, os.tmpdir(), function (binaryPath) {
        expect(binaryPath).to.be(undefined);
        done();
      }, 9);
    });
  });

  describe('unremovable binary', function () {
    // An unusable binary whose unlink fails used to be handed straight back by
    // binaryPath() and re-spawned for every remaining retry.
    it('does not retry when the binary cannot be replaced', function () {
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-local-')),
          binaryPath = path.join(dir, 'BrowserStackLocal');
      fs.writeFileSync(binaryPath, 'not executable', { mode: 0o644 });
      fs.chmodSync(dir, 0o555); // so the unlink fails

      try {
        var bsLocal = new browserstack.Local();
        bsLocal.binaryPath = binaryPath;
        var result = bsLocal.startSync({ key: 'dummy-key' });

        expect(result).to.be.a(Object);
        expect(result.message).to.contain('Error while trying to execute binary');
        expect(bsLocal.retriesLeft).to.equal(8); // one attempt, not nine
      } finally {
        fs.chmodSync(dir, 0o755);
        fs.unlinkSync(binaryPath);
        fs.rmdirSync(dir);
      }
    });
  });

  describe('isBinaryBusy', function () {
    it('reports a readable file as free', function () {
      var binary = new LocalBinary(),
          probe = path.join(os.tmpdir(), 'bs-local-probe-' + process.pid);
      fs.writeFileSync(probe, 'x');
      try {
        expect(binary.isBinaryBusy(probe)).to.be(false);
      } finally {
        fs.unlinkSync(probe);
      }
    });

    it('does not report a missing file as busy', function () {
      var binary = new LocalBinary();
      expect(binary.isBinaryBusy(path.join(os.tmpdir(), 'bs-local-absent-' + process.pid))).to.be(false);
    });
  });

  describe('download.js', function () {
    // The open failure is forced with a directory at the target path. The
    // errno differs from Windows' EBUSY (-4082); the code path is the same.
    it('reports an unwritable target without crashing the child', function () {
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-local-')),
          target = path.join(dir, 'BrowserStackLocal');
      fs.mkdirSync(target);

      var obj = childProcess.spawnSync(process.execPath, [
        path.join(__dirname, '..', 'lib', 'download.js'),
        target,
        'https://local-downloads.browserstack.com/binaries/release/latest_unzip/BrowserStackLocal'
      ], { env: Object.assign({ USER_AGENT: 'browserstack-local-test' }, process.env) });

      var stderr = obj.stderr.toString();
      expect(stderr).to.contain('Got Error while downloading binary file');
      // The signature of the old defect: node's unhandled-'error' bail-out.
      expect(stderr).to.not.contain('Unhandled \'error\' event');
      expect(obj.stdout.toString()).to.not.contain('Done');
      expect(obj.status).to.equal(1);

      fs.rmdirSync(target);
      fs.rmdirSync(dir);
    });
  });
});
