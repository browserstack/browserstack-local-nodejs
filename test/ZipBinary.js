var expect = require('expect.js');
var path = require('path');

var mocks = require('mocks'),
    httpMock = require('./lib/mocks').httpMock,
    fsMock = require('./lib/mocks').fsMock,
    unzipMock = require('./lib/mocks').unzipMock,
    sinon = require('sinon');

var PLATFORM = 'linux';
var ARCH = 'x64';
var EXT = 'exe';
var DEFAULT_BINARY_DIR = path.resolve(path.join(__dirname, '../bin', PLATFORM, ARCH));
var DEFAULT_BINARY_DIR_NO_ARCH = path.resolve(path.join(__dirname, '../bin', PLATFORM));
var DEFAULT_BINARY_FILE = path.join(DEFAULT_BINARY_DIR, 'BrowserStackLocal');
var DEFAULT_BINARY_FILE_WITH_EXT = path.join(DEFAULT_BINARY_DIR, 'BrowserStackLocal.' + EXT);
var DEFAULT_BINARY_FILE_NO_ARCH = path.join(DEFAULT_BINARY_DIR_NO_ARCH, 'BrowserStackLocal');
var OTHER_BINARY_DIR = '/bin';
var OTHER_BINARY_FILE = path.join(OTHER_BINARY_DIR, 'BrowserStackLocal');
var OTHER_BINARY_FILE_WITH_EXT = path.join(OTHER_BINARY_DIR, 'BrowserStackLocal.' + EXT);
var ZIP_URL = 'https://www.browserstack.com/browserstack-local/BrowserStackLocal-' + PLATFORM + '-' + ARCH + '.zip';
var ZIP_URL_NO_ARCH = 'https://www.browserstack.com/browserstack-local/BrowserStackLocal-win32.zip';

describe('ZipBinary', function () {
  var zipBinary, ZipBinary, platformMock, archMock, binaryPathMock, zipPathMock,
    logBinaryOutputMock, warnLogMock, infoLogMock, helper, basePathMock;

  beforeEach(function () {
    fsMock.fileNameModded = undefined;
    fsMock.mode = undefined;
    unzipMock.dirName = undefined;
    httpMock.url = undefined;

    platformMock = sinon.stub();
    archMock = sinon.stub();
    binaryPathMock = sinon.stub();
    zipPathMock = sinon.stub();
    logBinaryOutputMock = sinon.stub();
    warnLogMock = sinon.stub();
    infoLogMock = sinon.stub();
    basePathMock = sinon.stub();

    helper = {
      helper: function() {
        this._basePath = 'default';

        this.getPlatform = platformMock;
        this.getArch = archMock;
        this.getBinaryPath = binaryPathMock;
        this.getZipPath = zipPathMock;
        this.logBinaryOutput = logBinaryOutputMock;
        this.setBasePath = function(path) {
          console.log("CALLED");
          this._basePath = path
        };
        this.getBasePath = basePathMock;
        this.log = {
          warn: warnLogMock,
          info: infoLogMock
        };
      }
    };
    var zb = mocks.loadFile('./lib/ZipBinary.js', {
      https: httpMock,
      fs: fsMock,
      unzip: unzipMock,
      './helper': helper
    });
    ZipBinary = zb.ZipBinary;
  });

  describe('with default binary path', function () {
    it('should have the correct args', function () {
      zipBinary = new ZipBinary();
      expect(zipBinary.args).to.eql([]);
    });

    describe('#update', function () {
      it('should download the zip file', function (done) {
        platformMock.returns('linux');
        archMock.returns('x64');
        basePathMock.returns(DEFAULT_BINARY_DIR);
        binaryPathMock.returns(DEFAULT_BINARY_FILE);
        zipBinary = new ZipBinary();
        zipBinary.update(function () {
          expect(fsMock.fileNameModded).to.equal(DEFAULT_BINARY_FILE);
          expect(fsMock.mode).to.equal('0755');
          expect(unzipMock.dirName).to.equal(DEFAULT_BINARY_DIR);
          expect(httpMock.url).to.equal(ZIP_URL);
          done();
        });
      });

      describe('with no arch', function () {
        it('should download the zip file', function (done) {
          platformMock.returns('win32');
          archMock.returns('');
          basePathMock.returns(DEFAULT_BINARY_DIR_NO_ARCH);
          binaryPathMock.returns(DEFAULT_BINARY_FILE_NO_ARCH);
          zipBinary = new ZipBinary();
          zipBinary.update(function () {
            expect(fsMock.fileNameModded).to.equal(DEFAULT_BINARY_FILE_NO_ARCH);
            expect(fsMock.mode).to.equal('0755');
            expect(unzipMock.dirName).to.equal(DEFAULT_BINARY_DIR_NO_ARCH);
            expect(httpMock.url).to.equal(ZIP_URL_NO_ARCH);
            done();
          });
        });
      });
    });
  });

  describe('with given binary path', function () {
    it('should have the correct args', function () {
      zipBinary = new ZipBinary();
      expect(zipBinary.args).to.eql([]);
    });

    describe('#update', function () {
      it('should download the zip file', function (done) {
        platformMock.returns('linux');
        archMock.returns('x64');
        basePathMock.returns(OTHER_BINARY_DIR);
        binaryPathMock.returns(OTHER_BINARY_FILE);
        zipBinary = new ZipBinary();
        zipBinary.update(function () {
          expect(fsMock.fileNameModded).to.equal(OTHER_BINARY_FILE);
          expect(fsMock.mode).to.equal('0755');
          expect(unzipMock.dirName).to.equal(OTHER_BINARY_DIR);
          expect(httpMock.url).to.equal(ZIP_URL);
          done();
        });
      });

      describe('with no arch', function () {
        it('should download the zip file', function (done) {
          platformMock.returns('win32');
          archMock.returns('');
          basePathMock.returns(OTHER_BINARY_DIR);
          binaryPathMock.returns(OTHER_BINARY_FILE);
          zipBinary = new ZipBinary();
          zipBinary.update(function () {
            expect(fsMock.fileNameModded).to.equal(OTHER_BINARY_FILE);
            expect(fsMock.mode).to.equal('0755');
            expect(unzipMock.dirName).to.equal(OTHER_BINARY_DIR);
            expect(httpMock.url).to.equal(ZIP_URL_NO_ARCH);
            done();
          });
        });
      });
    });
  });
});
