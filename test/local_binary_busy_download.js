var expect = require('expect.js'),
    childProcess = require('child_process'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    LocalBinary = require('../lib/LocalBinary');

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
      expect(obj.status).to.equal(1);

      fs.rmdirSync(target);
      fs.rmdirSync(dir);
    });
  });
});
