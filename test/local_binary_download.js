var expect = require('expect.js'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    https = require('https'),
    stream = require('stream'),
    EventEmitter = require('events').EventEmitter,
    LocalBinary = require('../lib/LocalBinary');

// Regression tests for the download flow (LOC-7325 review round 4).
//
// `download()` writes whatever the response yields straight to the binary
// path, chmods it 0755 and hands it to `Local.start` to exec. Anything that
// gets past its validation is executed, so the checks below cover what the
// response must NOT be allowed to be, and that a failed attempt tears its
// write stream down before the retry opens another one.
//
// `https.get` is stubbed rather than served, so no network or TLS fixture is
// needed and each response shape is exact.
describe('LocalBinary download', function () {
  var destDir, binary, realGet, realCreateWriteStream, writeStreams;

  var DEST_BINARY = (process.platform.match(/win32/i)) ? 'BrowserStackLocal.exe' : 'BrowserStackLocal';

  // Minimal stand-in for an http.IncomingMessage.
  function fakeResponse(statusCode, headers) {
    var response = new stream.PassThrough();
    response.statusCode = statusCode;
    response.headers = headers || {};
    return response;
  }

  // Replaces https.get for one attempt. `handler` receives the fake request
  // emitter and decides what the server "does".
  function stubHttpsGet(handler) {
    https.get = function (options, onResponse) {
      var request = new EventEmitter();
      setImmediate(function () { handler(request, onResponse); });
      return request;
    };
  }

  beforeEach(function () {
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-binary-dl-'));
    binary = new LocalBinary();
    // Keep the download off the network: download() would otherwise resolve
    // the source URL over HTTP before touching the response at all.
    binary.getDownloadPath = function (conf, retries, callback) {
      callback(null, 'https://fake.invalid/BrowserStackLocal');
    };

    realGet = https.get;
    // Capture the write streams download() opens so the tests can assert they
    // were torn down.
    writeStreams = [];
    realCreateWriteStream = fs.createWriteStream;
    fs.createWriteStream = function () {
      var fileStream = realCreateWriteStream.apply(fs, arguments);
      writeStreams.push(fileStream);
      return fileStream;
    };
  });

  afterEach(function () {
    https.get = realGet;
    fs.createWriteStream = realCreateWriteStream;
    if (!destDir) return;
    if (fs.rmSync) fs.rmSync(destDir, { recursive: true, force: true });
    else fs.rmdirSync(destDir, { recursive: true });
  });

  it('does not accept a redirect body as the binary', function (done) {
    // https.get does not follow redirects, so a 3xx from an S3/CDN-fronted
    // source used to be piped to disk verbatim, chmodded 0755 and returned as
    // a successful download. Local.start then exec'd the HTML.
    stubHttpsGet(function (request, onResponse) {
      var response = fakeResponse(302, { location: 'https://elsewhere.invalid/x' });
      onResponse(response);
      response.end('<html>Moved Permanently</html>');
    });

    binary.download({}, destDir, function (binaryPath) {
      try {
        expect(binaryPath).to.equal(null);
        var written = path.join(destDir, DEST_BINARY);
        if (fs.existsSync(written))
          expect(fs.readFileSync(written, 'utf8')).to.not.match(/Moved Permanently/);
        expect(binary.downloadErrorMessage).to.match(/status code : 302/);
        done();
      } catch (assertionError) {
        done(assertionError);
      }
    }, 0);
  });

  it('does not accept an error body as the binary', function (done) {
    stubHttpsGet(function (request, onResponse) {
      var response = fakeResponse(404, {});
      onResponse(response);
      response.end('<html>Not Found</html>');
    });

    binary.download({}, destDir, function (binaryPath) {
      try {
        expect(binaryPath).to.equal(null);
        expect(binary.downloadErrorMessage).to.match(/status code : 404/);
        done();
      } catch (assertionError) {
        done(assertionError);
      }
    }, 0);
  });

  it('tears down the write stream when the response errors mid-download', function (done) {
    // pipe() unpipes the destination on a source error but never ends it.
    // Without an explicit destroy the write fd leaked and the retry opened a
    // second writer on the same path.
    stubHttpsGet(function (request, onResponse) {
      var response = fakeResponse(200, {});
      onResponse(response);
      response.write('partial');
      setImmediate(function () { response.emit('error', new Error('socket hang up')); });
    });

    binary.download({}, destDir, function (binaryPath) {
      try {
        expect(binaryPath).to.equal(null);
        expect(writeStreams.length).to.equal(1);
        expect(writeStreams[0].destroyed).to.equal(true);
        expect(binary.downloadErrorMessage).to.match(/socket hang up/);
        done();
      } catch (assertionError) {
        done(assertionError);
      }
    }, 0);
  });

  it('tears down the write stream when the request itself errors', function (done) {
    stubHttpsGet(function (request) {
      request.emit('error', new Error('ECONNREFUSED'));
    });

    binary.download({}, destDir, function (binaryPath) {
      try {
        expect(binaryPath).to.equal(null);
        expect(writeStreams.length).to.equal(1);
        expect(writeStreams[0].destroyed).to.equal(true);
        expect(binary.downloadErrorMessage).to.match(/ECONNREFUSED/);
        done();
      } catch (assertionError) {
        done(assertionError);
      }
    }, 0);
  });

  // The sync retry path used to delete the binary inside an async fs.stat
  // callback, so retryBinaryDownload returned undefined and the
  // `return that.downloadSync(...)` value was discarded. downloadSync then
  // reported a terminal failure on the first attempt while the retry chain
  // kept running in the background.
  it('returns the retried downloadSync result on the sync path', function () {
    var attempts = [];
    binary.downloadSync = function (conf, destParentDir, retries) {
      attempts.push(retries);
      return '/downloaded/on/retry';
    };

    var result = binary.retryBinaryDownload({}, destDir, null, 3, path.join(destDir, DEST_BINARY));

    expect(result).to.equal('/downloaded/on/retry');
    expect(attempts).to.eql([2]);
  });

  it('deletes a stale binary before retrying on the sync path', function () {
    var binaryPath = path.join(destDir, DEST_BINARY);
    fs.writeFileSync(binaryPath, 'corrupt');
    var existedDuringRetry = null;
    binary.downloadSync = function () {
      existedDuringRetry = fs.existsSync(binaryPath);
      return binaryPath;
    };

    binary.retryBinaryDownload({}, destDir, null, 2, binaryPath);

    expect(existedDuringRetry).to.equal(false);
  });

  it('stops the sync retry chain when the retry budget is exhausted', function () {
    var called = false;
    binary.downloadSync = function () { called = true; };

    var result = binary.retryBinaryDownload({}, destDir, null, 0, path.join(destDir, DEST_BINARY));

    expect(called).to.equal(false);
    expect(result).to.equal(undefined);
  });
});
