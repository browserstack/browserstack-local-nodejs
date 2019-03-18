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

describe('Local', function () {
  var bsLocal;
  beforeEach(function () {
    bsLocal = new browserstack.Local();
  });

  it('should have pid when running', function (done) {
    this.timeout(600000);
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY }, function(){
      expect(bsLocal.tunnel.pid).to.not.equal(0);
      done();
    });
  });

  it('should return is running properly', function (done) {
    this.timeout(60000);
    expect(bsLocal.isRunning()).to.not.equal(true);
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY }, function(){
      expect(bsLocal.isRunning()).to.equal(true);
      done();
    });
  });

  it('should throw error on running multiple binary', function (done) {
    this.timeout(60000);
    bsLocal.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY }, function(error){
      bsLocal_2 = new browserstack.Local();
      var tempLogPath = path.join(process.cwd(), 'log2.log');

      bsLocal_2.start({ 'key': process.env.BROWSERSTACK_ACCESS_KEY, 'logfile': tempLogPath }, function(error){
        expect(error.toString().trim()).to.equal('LocalError: Either another browserstack local client is running on your machine or some server is listening on port 45691');
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
      expect(bsLocal.isRunning()).to.equal(true);
      bsLocal.stop(function(){
        expect(bsLocal.isRunning()).to.equal(false);
        done();
      });
    });
  });

  afterEach(function (done) {
    this.timeout(60000);
    bsLocal.stop(done);
  });

});

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
      (new LocalBinary()).binaryPath({}, function(binaryPath) {
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
      sandBox = sinon.createSandbox();
    });

    it('Tries to download binary if its corrupted', function(done) {
      fs.unlink(defaultBinaryPath, function() {
        var localBinary = new LocalBinary();
        var downloadStub = sandBox.stub(localBinary, 'download').callsFake(function() {
          downloadStub.callArgWith(2, [ defaultBinaryPath ]);
          expect(downloadStub.args[0][3]).to.be(5);
        });

        fs.writeFile(defaultBinaryPath, 'Random String', function() {
          fs.chmod(defaultBinaryPath, '0755', function() {
            localBinary.binaryPath({
            }, function(binaryPath) {
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
        var downloadStub = sandBox.stub(localBinary, 'download').callsFake(function() {
          downloadStub.callArgWith(2, [ defaultBinaryPath ]);
          expect(downloadStub.args[0][3]).to.be(5);
        });

        localBinary.binaryPath({
        }, function(binaryPath) {
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
        expect(fs.existsSync(result)).to.equal(true);
        done();
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
        expect(fs.existsSync(result)).to.equal(true);
        done();
      });
    });
  });
});
