/* Regression tests for #164: proxyUser/proxyPass reached the running binary
   (--proxy-user/--proxy-pass) but not the binary download, so a proxy that requires
   Basic auth refused the download with 407 and Local never started.

   Everything here runs offline: the proxy is test/fixtures/recording_proxy.js, which
   records each CONNECT's Proxy-Authorization header and refuses it with 407. It runs
   in its own process because the sync path blocks this one in spawnSync. */
var expect = require('expect.js'),
    sinon = require('sinon'),
    rimraf = require('rimraf'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    childProcess = require('child_process'),
    browserstack = require('../index'),
    LocalBinary = require('../lib/LocalBinary'),
    buildProxyAgent = require('../lib/util').buildProxyAgent;

var PROXY_USER = 'corpuser',
    // ':' and '@' would be mangled if the credentials were ever treated as a URL.
    PROXY_PASS = 'corp:pass@1',
    EXPECTED_AUTH = 'Basic ' + Buffer.from(PROXY_USER + ':' + PROXY_PASS).toString('base64'),
    BINARY_HOST = 'local-downloads.browserstack.com',
    BINARY_BASE_URL = 'https://' + BINARY_HOST + '/binaries/release/latest_unzip',
    TEST_TIMEOUT = 20000;

function check(done, assertions) {
  try {
    assertions();
    done();
  } catch (err) {
    done(err);
  }
}

/* Points every directory LocalBinary searches for an existing binary (home, cwd,
   tmpdir) at a fresh empty dir, so start()/startSync() really download. */
function isolateBinaryDirs() {
  var saved = { HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, cwd: process.cwd() };
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-local-proxy-auth-'));
  process.env.HOME = dir;
  process.env.TMPDIR = dir;
  process.chdir(dir);
  return function restore() {
    process.chdir(saved.cwd);
    ['HOME', 'TMPDIR'].forEach(function (name) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    });
    rimraf.sync(dir);
  };
}

describe('Binary download through an authenticating proxy', function () {
  var proxyProcess, proxyPort, sandBox, restoreDirs, tempDir;

  function proxyConf(extra) {
    return Object.assign({ proxyHost: '127.0.0.1', proxyPort: proxyPort,
      proxyUser: PROXY_USER, proxyPass: PROXY_PASS }, extra || {});
  }

  function recordedRequests(callback) {
    proxyProcess.once('message', function (msg) { callback(msg.requests); });
    proxyProcess.send('dump');
  }

  function expectAuthenticated(requests, target) {
    expect(requests.length).to.be.greaterThan(0);
    requests.forEach(function (request) {
      expect(request.auth).to.equal(EXPECTED_AUTH);
      if (target) expect(request.target).to.equal(target);
    });
  }

  before(function (done) {
    proxyProcess = childProcess.fork(path.join(__dirname, 'fixtures', 'recording_proxy.js'));
    proxyProcess.once('message', function (msg) {
      proxyPort = msg.port;
      done();
    });
  });

  after(function () {
    proxyProcess.send('stop');
  });

  beforeEach(function () {
    sandBox = sinon.sandbox.create();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-local-proxy-auth-dl-'));
  });

  afterEach(function () {
    sandBox.restore();
    if (restoreDirs) restoreDirs();
    restoreDirs = null;
    rimraf.sync(tempDir);
    delete process.env.BROWSERSTACK_LOCAL_PROXY_USER;
    delete process.env.BROWSERSTACK_LOCAL_PROXY_PASS;
  });

  it('Local.start sends the proxy credentials when it downloads the binary', function (done) {
    this.timeout(TEST_TIMEOUT);
    restoreDirs = isolateBinaryDirs();
    new browserstack.Local().start(proxyConf({ key: 'DUMMY' }), function () {
      recordedRequests(function (requests) {
        check(done, function () { expectAuthenticated(requests); });
      });
    });
  });

  it('Local.startSync sends the proxy credentials, through the environment and not argv', function (done) {
    this.timeout(TEST_TIMEOUT);
    restoreDirs = isolateBinaryDirs();
    var spawnSpy = sandBox.spy(childProcess, 'spawnSync');

    new browserstack.Local().startSync(proxyConf({ key: 'DUMMY' }));

    var downloadSpawns = spawnSpy.args.filter(function (args) {
      return /(fetchDownloadSourceUrl|download)\.js$/.test(String(args[1] && args[1][0]));
    });
    recordedRequests(function (requests) {
      check(done, function () {
        expect(downloadSpawns.length).to.be.greaterThan(0);
        downloadSpawns.forEach(function (args) {
          var argv = args[1].map(String).join(' ');
          expect(argv).to.not.contain(PROXY_USER);
          expect(argv).to.not.contain(PROXY_PASS);
          expect(args[2].env.BROWSERSTACK_LOCAL_PROXY_USER).to.equal(PROXY_USER);
          expect(args[2].env.BROWSERSTACK_LOCAL_PROXY_PASS).to.equal(PROXY_PASS);
        });
        expectAuthenticated(requests);
      });
    });
  });

  it('sends the proxy credentials on the binary request itself (async)', function (done) {
    this.timeout(TEST_TIMEOUT);
    var binary = new LocalBinary();
    sandBox.stub(binary, 'getDownloadPath', function (conf, retries, callback) {
      callback(null, BINARY_BASE_URL + '/' + binary.getBinaryFilename());
    });
    binary.download(proxyConf(), tempDir, function () {
      recordedRequests(function (requests) {
        check(done, function () { expectAuthenticated(requests, BINARY_HOST + ':443'); });
      });
    }, 0);
  });

  it('sends the proxy credentials on the binary request itself (sync)', function (done) {
    this.timeout(TEST_TIMEOUT);
    var binary = new LocalBinary();
    sandBox.stub(binary, 'getSourceUrlSync', function () { return BINARY_BASE_URL; });
    binary.downloadSync(proxyConf(), tempDir, 0);
    recordedRequests(function (requests) {
      check(done, function () { expectAuthenticated(requests, BINARY_HOST + ':443'); });
    });
  });

  it('sends no Proxy-Authorization when no proxy user is configured', function (done) {
    this.timeout(TEST_TIMEOUT);
    restoreDirs = isolateBinaryDirs();
    // proxyPass alone is ignored, as the README documents.
    new browserstack.Local().start(proxyConf({ key: 'DUMMY', proxyUser: undefined }), function () {
      recordedRequests(function (requests) {
        check(done, function () {
          expect(requests.length).to.be.greaterThan(0);
          requests.forEach(function (request) { expect(request.auth).to.equal(null); });
        });
      });
    });
  });

  it('does not hand proxy credentials already in process.env to the download scripts', function () {
    process.env.BROWSERSTACK_LOCAL_PROXY_USER = 'planted-user';
    process.env.BROWSERSTACK_LOCAL_PROXY_PASS = 'planted-pass';
    var spawnStub = sandBox.stub(childProcess, 'spawnSync', function () {
      return { stdout: Buffer.from('https://legit.browserstack.com/bs\n'), stderr: Buffer.from('') };
    });
    var binary = new LocalBinary();
    binary.parentRetries = 9;

    binary.getSourceUrlSync(proxyConf({ proxyUser: undefined, proxyPass: undefined }), 9);

    var childEnv = spawnStub.args[0][2].env;
    expect(childEnv).to.not.have.property('BROWSERSTACK_LOCAL_PROXY_USER');
    expect(childEnv).to.not.have.property('BROWSERSTACK_LOCAL_PROXY_PASS');
  });
});

describe('buildProxyAgent', function () {
  it('adds Basic auth from proxyUser and proxyPass', function () {
    expect(buildProxyAgent('127.0.0.1', 3128, PROXY_USER, PROXY_PASS).proxy.auth).to.equal(PROXY_USER + ':' + PROXY_PASS);
  });

  it('allows a proxy user with an empty password', function () {
    expect(buildProxyAgent('127.0.0.1', 3128, PROXY_USER, undefined).proxy.auth).to.equal(PROXY_USER + ':');
  });

  it('ignores proxyPass without proxyUser', function () {
    expect(buildProxyAgent('127.0.0.1', 3128, undefined, PROXY_PASS).proxy.auth).to.equal(undefined);
  });

  it('returns no agent without both host and port, including the "undefined" argv placeholder', function () {
    expect(buildProxyAgent(undefined, 3128)).to.equal(undefined);
    expect(buildProxyAgent('127.0.0.1', undefined)).to.equal(undefined);
    expect(buildProxyAgent('undefined', 'undefined', PROXY_USER, PROXY_PASS)).to.equal(undefined);
    expect(buildProxyAgent('', '')).to.equal(undefined);
  });
});
