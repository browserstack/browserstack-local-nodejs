var expect = require('expect.js'),
    sinon = require('sinon'),
    mocks = require('mocks'),
    path = require('path'),
    fs = require('fs'),
    rimraf = require('rimraf'),
    Proxy = require('proxy'),
    tempfs = require('temp-fs'),
    browserstack = require('../index'),
    LocalBinary = require('../lib/LocalBinary');


const MAX_TIMEOUT = 600000;

// Assertions that run inside asynchronous callbacks (e.g. the tree-kill
// callback fired from Local.stop, or binary-download callbacks) execute
// outside Mocha's synchronous try/catch. A throw there escapes as an
// uncaught exception and aborts the whole Mocha process, which hides the
// results of every test that has not run yet. `check` runs the assertions
// in a try/catch and routes any failure through `done`, so a failing
// assertion is reported as a normal test failure and the run continues.
function check(done, assertions) {
  try {
    assertions();
    done();
  } catch (err) {
    done(err);
  }
}

describe('Local', function () {
  var bsLocal;
  beforeEach(function () {
    bsLocal = new browserstack.Local();
  });

  it('should have pid when running', function (done) {
    this.timeout(600000);
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY }, function(){
      check(done, function(){
        expect(bsLocal.tunnel.pid).to.not.equal(0);
      });
    });
  });

  it('should return is running properly', function (done) {
    this.timeout(60000);
    expect(bsLocal.isRunning()).to.not.equal(true);
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY }, function(){
      check(done, function(){
        expect(bsLocal.isRunning()).to.equal(true);
      });
    });
  });

  it.skip('should throw error on running multiple binary', function (done) {
    this.timeout(60000);
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY }, function(error){
      bsLocal_2 = new browserstack.Local();
      var tempLogPath = path.join(process.cwd(), 'log2.log');

      bsLocal_2.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, 'logfile': tempLogPath }, function(error){
        expect(error.toString().trim()).to.equal('LocalError: Either another browserstack local client is running on your machine or some server is listening on port 45690');
        fs.unlinkSync(tempLogPath);
        done();
      });
    });
  });

  it('should enable verbose', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'verbose': true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--verbose')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('1')).to.not.equal(-1);
      done();
    });
  });

  it('should enable verbose with log level', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'verbose': 2 }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--verbose')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('2')).to.not.equal(-1);
      done();
    });
  });

  it('should enable verbose with log level string', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'verbose': '2' }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--verbose')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('2')).to.not.equal(-1);
      done();
    });
  });

  it('should set folder testing', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'f': '/var/html' }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('-f')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('/var/html')).to.not.equal(-1);
      done();
    });
  });

  it('should set folder testing with folder option', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'folder': '/var/html' }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('-f')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('/var/html')).to.not.equal(-1);
      done();
    });
  });

  it('should enable force', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'force': true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--force')).to.not.equal(-1);
      done();
    });
  });

  it('should enable only', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'only': true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--only')).to.not.equal(-1);
      done();
    });
  });

  it('should enable onlyAutomate', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'onlyAutomate': true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--only-automate')).to.not.equal(-1);
      done();
    });
  });

  it('should enable forcelocal', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'forcelocal': true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--force-local')).to.not.equal(-1);
      done();
    });
  });

  it('should enable forcelocal with camel case', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'forceLocal': true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--force-local')).to.not.equal(-1);
      done();
    });
  });

  it('should enable custom boolean args', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'boolArg1': true, 'boolArg2': true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--boolArg1')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('--boolArg2')).to.not.equal(-1);
      done();
    });
  });

  it('should enable custom keyval args', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'customKey1': 'custom value1', 'customKey2': 'custom value2' }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--customKey1')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('custom value1')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('--customKey2')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('custom value2')).to.not.equal(-1);
      done();
    });
  });

  it('should enable forceproxy', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'forceproxy': true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--force-proxy')).to.not.equal(-1);
      done();
    });
  });

  it('should enable forceproxy with camel case', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'forceProxy': true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--force-proxy')).to.not.equal(-1);
      done();
    });
  });


  it('should set localIdentifier', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'localIdentifier': 'abcdef' }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--local-identifier')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('abcdef')).to.not.equal(-1);
      done();
    });
  });

  it('should set parallelRuns', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'parallelRuns': '10' }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--parallel-runs')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('10')).to.not.equal(-1);
      done();
    });
  });

  it('should set parallelRuns with integer value', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'parallelRuns': 10 }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--parallel-runs')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('10')).to.not.equal(-1);
      done();
    });
  });

  it('should set proxy', function (done) {
    bsLocal.start({ 
      'key': process.env.BROWSERSTACK_ACCESS_KEY, 
      onlyCommand: true, 
      'proxyHost': 'localhost',
      'proxyPort': 8080,
      'proxyUser': 'user',
      'proxyPass': 'pass'
    }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--proxy-host')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('localhost')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('--proxy-port')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf(8080)).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('--proxy-user')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('user')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('--proxy-pass')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('pass')).to.not.equal(-1);
      done();
    });
  });

  it('should set hosts', function (done) {
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, 'only': 'localhost,8000,0'}, function(){
      expect(bsLocal.getBinaryArgs().indexOf('--only')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('localhost,8000,0')).to.not.equal(-1);
      done();
    });
  });

  it('should stop local', function (done) {
    this.timeout(MAX_TIMEOUT);
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY}, function(){
      try {
        expect(bsLocal.isRunning()).to.equal(true);
      } catch (err) {
        return done(err);
      }
      bsLocal.stop(function(){
        check(done, function(){
          expect(bsLocal.isRunning()).to.equal(false);
        });
      });
    });
  });

  afterEach(function (done) {
    this.timeout(60000);
    bsLocal.stop(done);
  });
});

describe('Start sync', () => {
  var bsLocal, bsLocal_2;
  beforeEach(function () {
    bsLocal = new browserstack.Local();
  });

  it('should have pid when running', function () {
    this.timeout(60000);
    bsLocal.startSync({ 'key': process.env.BROWSERSTACK_ACCESS_KEY});
    expect(bsLocal.tunnel.pid).to.not.equal(0);
  });

  it('should return is running properly', function () {
    this.timeout(60000);
    expect(bsLocal.isRunning()).to.not.equal(true);
    bsLocal.startSync({ 'key': process.env.BROWSERSTACK_ACCESS_KEY});
    expect(bsLocal.isRunning()).to.equal(true);
  });

  it.skip('should throw error on running multiple binary', function () {
    this.timeout(60000);
    bsLocal.startSync({ 'key': process.env.BROWSERSTACK_ACCESS_KEY });
    bsLocal_2 = new browserstack.Local();
    var tempLogPath = path.join(process.cwd(), 'log2.log');
    const error = bsLocal_2.startSync({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, 'logfile': tempLogPath });
    expect(error.toString().trim()).to.equal('LocalError: Either another browserstack local client is running on your machine or some server is listening on port 45690');
    fs.unlinkSync(tempLogPath);
  });

  afterEach(function (done) {
    this.timeout(60000);
    bsLocal.stop(() => {
      if (bsLocal_2) {
        bsLocal_2.stop(done);
      } else {
        done();
      }
    });
  });
})

describe('LocalBinary', function () {
  describe('Retries', function() {
    var unlinkTmp,
      defaultBinaryPath,
      validBinaryPath,
      sandBox;

    before(function(done) {
      this.timeout(MAX_TIMEOUT);
      // ensure that we have a valid binary downloaded

      // removeIfInvalid();
      // binaryPath signature is (conf, bsHost, key, parentRetries, callback).
      (new LocalBinary()).binaryPath({}, null, 'abc', 9, function(binaryPath) {
        defaultBinaryPath = binaryPath;
        tempfs.mkdir({
          recursive: true
        }, function(err, dir) {
          if(err) { throw err; }

          validBinaryPath = path.join(dir.path, path.basename(binaryPath));
          fs.rename(defaultBinaryPath, validBinaryPath, function(err) {
            if(err) { throw err; }

            unlinkTmp = dir.unlink;
            done();
          });
        });
      });
    });

    beforeEach(function() {
      sandBox = sinon.sandbox.create();
    });

    it('Tries to download binary if its corrupted', function(done) {
      fs.unlink(defaultBinaryPath, function() {
        var localBinary = new LocalBinary();
        var downloadStub = sandBox.stub(localBinary, 'download', function() {
          downloadStub.callArgWith(2, [ defaultBinaryPath ]);
          expect(downloadStub.args[0][3]).to.be(9);
        });

        fs.writeFile(defaultBinaryPath, 'Random String', function() {
          fs.chmod(defaultBinaryPath, '0755', function() {
            localBinary.binaryPath({
            }, null, 'abc', 9, function(binaryPath) {
              expect(downloadStub.called).to.be.true;
              done();
            });
          });
        });
      });
    });

    it('Tries to download binary if its not present', function(done) {
      fs.unlink(defaultBinaryPath, function() {
        var localBinary = new LocalBinary();
        var downloadStub = sandBox.stub(localBinary, 'download', function() {
          downloadStub.callArgWith(2, [ defaultBinaryPath ]);
          expect(downloadStub.args[0][3]).to.be(9);
        });

        localBinary.binaryPath({
        }, null, 'abc', 9, function(binaryPath) {
          expect(downloadStub.called).to.be.true;
          done();
        });
      });
    });

    afterEach(function(done) {
      sandBox.restore();
      done();
    });

    after(function(done) {
      fs.rename(validBinaryPath, defaultBinaryPath, function(err) {
        if(err) { throw err; }

        unlinkTmp(done);
      });
    });
  });

  // The OS/arch -> binary filename mapping used to be asserted via
  // getDownloadPath(), but getDownloadPath is now async and prefixes a
  // dynamically fetched source URL (see getSourceUrl). The OS-specific part
  // of the download path now lives entirely in getBinaryFilename(), so these
  // tests exercise that directly. hostOS/is64bits/isArm64/isAlpine are plain
  // instance fields, so they are overridden by assignment (no sinon needed,
  // which also avoids double-wrapping the same property inside a loop).
  describe('Binary filename', function() {
    var localBinary;

    beforeEach(function() {
      localBinary = new LocalBinary();
    });

    it('should return darwin binary filename', function() {
      ['darwin', 'mac os'].forEach(function(os) {
        localBinary.hostOS = os;
        expect(localBinary.getBinaryFilename()).to.equal('BrowserStackLocal-darwin-x64');
      });
    });

    it('should return exe binary filename', function() {
      ['mswin', 'msys', 'mingw', 'cygwin', 'bccwin', 'wince', 'emc', 'win32'].forEach(function(os) {
        localBinary.hostOS = os;
        expect(localBinary.getBinaryFilename()).to.equal('BrowserStackLocal.exe');
      });
    });

    it('should return linux 64 arch binary filename', function() {
      localBinary.hostOS = 'linux';
      localBinary.isArm64 = false;
      localBinary.is64bits = true;
      localBinary.isAlpine = function() { return false; };
      expect(localBinary.getBinaryFilename()).to.equal('BrowserStackLocal-linux-x64');
    });

    it('should return linux 32 arch binary filename', function() {
      localBinary.hostOS = 'linux';
      localBinary.isArm64 = false;
      localBinary.is64bits = false;
      localBinary.isAlpine = function() { return false; };
      expect(localBinary.getBinaryFilename()).to.equal('BrowserStackLocal-linux-ia32');
    });

    it('should return alpine linux binary filename', function() {
      localBinary.hostOS = 'linux';
      localBinary.isArm64 = false;
      localBinary.is64bits = true;
      localBinary.isAlpine = function() { return true; };
      expect(localBinary.getBinaryFilename()).to.equal('BrowserStackLocal-alpine');
    });
  });

  describe('Download', function() {
    var proxy;
    var proxyPort;
    var binary;
    var tempDownloadPath;

    before(function (done) {
      // setup HTTP proxy server
      proxy = new Proxy();
      proxy.listen(function () {
        proxyPort = proxy.address().port;
        done();
      });
    });

    after(function (done) {
      proxy.once('close', function () { done(); });
      proxy.close();
    });

    beforeEach(function () {
      binary = new LocalBinary();
      tempDownloadPath = path.join(process.cwd(), 'download');
    });

    afterEach(function () {
      rimraf.sync(tempDownloadPath);
    });

    it('should download binaries without proxy', function (done) {
      this.timeout(MAX_TIMEOUT);
      var conf = {};
      binary.download(conf, tempDownloadPath, function (result) {
        check(done, function(){
          expect(fs.existsSync(result)).to.equal(true);
        });
      });
    });

    it('should download binaries with proxy', function (done) {
      this.timeout(MAX_TIMEOUT);
      var conf = {
        proxyHost: '127.0.0.1',
        proxyPort: proxyPort
      };
      binary.download(conf, tempDownloadPath, function (result) {
        // test for file existence
        check(done, function(){
          expect(fs.existsSync(result)).to.equal(true);
        });
      });
    });

    it('should download binaries in sync', function () {
      this.timeout(MAX_TIMEOUT);
      var conf = {};
      const result = binary.downloadSync(conf, tempDownloadPath);
      expect(fs.existsSync(result)).to.equal(true);
    });
  });
});

// Regression tests: the binary-download fallback signalling used to live on
// process.env, so (a) a value planted in process.env steered the download to an
// arbitrary host with no validation, and (b) a failure on one Local instance bled
// into every sibling instance in the same process. Both flip from FAIL on the
// pre-fix code to PASS once the state is per-instance.
describe('Binary download state isolation', function () {
  var sandBox, childProcess;
  var Local = require('../lib/Local');

  beforeEach(function () {
    sandBox = sinon.sandbox.create();
    childProcess = require('child_process');
  });

  afterEach(function () {
    sandBox.restore();
    delete process.env.BINARY_DOWNLOAD_SOURCE_URL;
    delete process.env.BINARY_DOWNLOAD_FALLBACK_ENABLED;
    delete process.env.BINARY_DOWNLOAD_ERROR_MESSAGE;
  });

  it('does not honor a BINARY_DOWNLOAD_SOURCE_URL planted in process.env', function () {
    // An attacker (CI secret injection, malicious dep, shared-workspace .env) or a
    // sibling instance leaves these two vars set.
    process.env.BINARY_DOWNLOAD_SOURCE_URL = 'https://attacker.example.com/evil';
    process.env.BINARY_DOWNLOAD_FALLBACK_ENABLED = 'true';

    // Stub the endpoint API child process so nothing hits the network; the stub
    // stands in for a legitimate BrowserStack endpoint response.
    var spawnStub = sandBox.stub(childProcess, 'spawnSync', function () {
      return {
        stdout: Buffer.from('https://legit.browserstack.com/bs\n'),
        stderr: Buffer.from('')
      };
    });

    var binary = new LocalBinary();
    binary.key = 'DUMMY';
    binary.bsHost = 'local.browserstack.com';
    binary.parentRetries = 9;

    var url = binary.getSourceUrlSync({}, 9);

    // Pre-fix: the env-shortcut returns the attacker URL and spawnSync is never
    // reached. Post-fix: the shortcut is gone, so the real endpoint call runs.
    expect(url).to.not.equal('https://attacker.example.com/evil');
    expect(url).to.equal('https://legit.browserstack.com/bs');
    expect(spawnStub.called).to.equal(true);
  });

  it('keeps download-fallback state per Local instance (no cross-instance bleed)', function () {
    var a = new Local();
    var b = new Local();

    // Instance A records a download failure (as its retry catch block does).
    a.binaryDownloadState.fallbackEnabled = true;
    a.binaryDownloadState.errorMessage = 'A private error: key=A_SECRET';
    a.binaryDownloadState.sourceURL = 'https://a-context.example/bs';

    // Instance B, which never failed, must be unaffected.
    expect(b.binaryDownloadState.fallbackEnabled).to.equal(false);
    expect(b.binaryDownloadState.errorMessage).to.equal(null);
    expect(b.binaryDownloadState.sourceURL).to.equal(null);

    // And nothing leaked to the process-global env.
    expect(process.env.BINARY_DOWNLOAD_FALLBACK_ENABLED).to.equal(undefined);
    expect(process.env.BINARY_DOWNLOAD_SOURCE_URL).to.equal(undefined);
    expect(process.env.BINARY_DOWNLOAD_ERROR_MESSAGE).to.equal(undefined);
  });
});
