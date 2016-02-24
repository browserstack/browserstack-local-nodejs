var expect = require('expect.js'),
    mocks = require('mocks'),
    childProcessMock = require('./lib/mocks').childProcessMock,
    httpMock = require('./lib/mocks').httpMock,
    fsMock = require('./lib/mocks').fsMock,
    unzipMock = require('./lib/mocks').unzipMock,
    osMock = require('./lib/mocks').osMock,
    tailMock = require('./lib/mocks').tailMock,
    sinon = require('sinon');

var spawnSpy = sinon.spy(childProcessMock.spawn);
childProcessMock.spawn = spawnSpy;

    NEW_BINARY_FILE = '/bin/new' + '/BrowserStackLocal',
    NEW_WIN32_BINARY_FILE = '/bin/new' + '/BrowserStackLocal.exe',
    OSX_BINARY_FILE = '/bin/darwin' + '/BrowserStackLocal',
    LINUX_64_BINARY_FILE = '/bin/linux64' + '/BrowserStackLocal',
    LINUX_32_BINARY_FILE = '/bin/linux32' + '/BrowserStackLocal',
    WIN32_BINARY_FILE = '/bin/win32' + '/BrowserStackLocal.exe',
    OSX_BINARY_URL = 'https://www.browserstack.com/browserstack-local/BrowserStackLocal-darwin-x64.zip',
    LINUX_64_BINARY_URL = 'https://www.browserstack.com/browserstack-local/BrowserStackLocal-linux-x64.zip',
    LINUX_32_BINARY_URL = 'https://www.browserstack.com/browserstack-local/BrowserStackLocal-linux-ia32.zip',
    WIN32_BINARY_URL = 'https://www.browserstack.com/browserstack-local/BrowserStackLocal-win32.zip',
    HOST_NAME = 'localhost',
    PORT = 8080,
    INVALID_PORT = 8081,
    SSL_FLAG = 0,
    KEY = 'This is a fake key',
    HOST_NAME2 = 'localhost2',
    PORT2 = 8081,
    SSL_FLAG2 = 1,
    PROXY_HOST = 'fakehost.com',
    PROXY_USER = 'proxyuser',
    PROXY_PASS = 'proxypass',
    PROXY_PORT = '1234',
    LOG_FILE_PATH = '';

describe('BrowserStackTunnel', function () {
  var bs, helper, platformMock, archMock, binaryPathMock, zipPathMock, logBinaryOutputMock, warnLogMock, infoLogMock, ZipBinary, logFilePathMock;
  beforeEach(function () {
    fsMock.fileNameModded = undefined;
    fsMock.mode = undefined;
    fsMock.fileNameCreated = undefined;
    fsMock.fileName = undefined;
    unzipMock.dirName = undefined;
    httpMock.url = undefined;
    osMock._platform = 'unknown';
    osMock._arch = 'unknown';

    platformMock = sinon.stub();
    archMock = sinon.stub();
    binaryPathMock = sinon.stub();
    zipPathMock = sinon.stub();
    logBinaryOutputMock = sinon.stub();
    warnLogMock = sinon.stub();
    infoLogMock = sinon.stub();
    logFilePathMock = sinon.stub().returns('');

    helper = {
      helper: function() {
        this._binaryPath = 'default';

        this.getPlatform = platformMock;
        this.getArch = archMock;
        this.getBinaryPath = binaryPathMock;
        this.getLogFilePath = logFilePathMock;
        this.getZipPath = zipPathMock;
        this.logBinaryOutput = logBinaryOutputMock;
        this.setBinaryPath = function(path) {
          _binaryPath = path
        };
        this.getBinaryPath = function() {
          return _binaryPath
        };
        this.log = {
          warn: warnLogMock,
          info: infoLogMock
        };
        this.fallbackBase = sinon.stub();
      }
    };
    var zb = mocks.loadFile('./lib/ZipBinary.js', {
      https: httpMock,
      fs: fsMock,
      unzip: unzipMock,
      './helper': helper
    });
    ZipBinary = zb.ZipBinary;
    bs = mocks.loadFile('./lib/browserStackTunnel.js', {
      child_process: childProcessMock,
      http: httpMock,
      tail: tailMock,
      fs: fsMock,
      os: osMock,
      './helper': helper,
      './ZipBinary': ZipBinary
    });
  });

  it('should error if stopped before started', function (done) {
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: KEY,
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.stop(function (error) {
      expect(error.message).to.be('child not started');
      done();
    });
  });

  it('should error if no server listening on the specified host and port', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: KEY,
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.start(function (error) {
      expect(error.message).to.contain('Could not connect to server');
      done();
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  **Error: Could not connect to server: ----monkey');
    }, 100);
  });

  it('should error if user provided an invalid key', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: 'MONKEY_KEY',
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.start(function (error) {
      expect(error.message).to.contain('Invalid key');
      done();
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  **Error: You provided an invalid key ----monkey');
    }, 100);
  });

  it('should error if started when already running', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: KEY,
      binaryPath: WIN32_BINARY_FILE
    });

    browserStackTunnel.start(function (error) {
      if (error) {
        expect().fail(function () { return error; });
      }
      browserStackTunnel.start(function (error) {
        expect(error.message).to.be('child already started');
        done();
      });
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
    }, 100);
  });

  it('should error if started when another instance is already running', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    var browserStackTunnel1 = new bs.BrowserStackTunnel({
      key: KEY,
      binaryPath: WIN32_BINARY_FILE
    });

    var browserStackTunnel2 = new bs.BrowserStackTunnel({
      key: KEY,
      binaryPath: WIN32_BINARY_FILE
    });

    browserStackTunnel1.start(function (error) {
      if (error) {
        expect().fail(function () { return error; });
      }
      browserStackTunnel2.start(function (error) {
        expect(error.message).to.be('child already started');
        done();
      });

      setTimeout(function () {
        browserStackTunnel2.tail.emit('mock:child_process:stdout:data', 'monkey-----  **Error: There is another JAR already running ----monkey');
      }, 100);
    });

    setTimeout(function () {
      browserStackTunnel1.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
    }, 100);
  });

  it('should download new binary if prompted that a new version exists as auto download is not compatible with our use of spawn', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: 'MONKEY_KEY',
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.start(function (error) {
      if (error) {
        expect().fail(function () { return error; });
      }
      expect(fsMock.fileNameModded).to.equal(WIN32_BINARY_FILE);
      expect(fsMock.mode).to.equal('0755');
      //expect(unzipMock.dirName).to.equal(WIN32_BINARY_DIR);
      //expect(httpMock.url).to.equal(WIN32_BINARY_URL);
      done();
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  **There is a new version of BrowserStackTunnel.jar available on server ----monkey');
      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
      }, 100);
    }, 100);
  });

  it('should support multiple hosts', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    spawnSpy.reset();
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: KEY,
      hosts: HOST_NAME + ',' + PORT + ',' + SSL_FLAG + ',' + HOST_NAME2 + ',' + PORT2 + ',' + SSL_FLAG2,
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.start(function (error) {
      if (error) {
        expect().fail(function () { return error; });
      } else if (browserStackTunnel.state === 'started') {
        sinon.assert.calledOnce(spawnSpy);
        sinon.assert.calledWithExactly(
          spawnSpy,
          WIN32_BINARY_FILE, [
            KEY,
            HOST_NAME + ',' + PORT + ',' + SSL_FLAG + ',' + HOST_NAME2 + ',' + PORT2 + ',' + SSL_FLAG2,
            '-logFile',
            LOG_FILE_PATH
          ]
        );
        done();
      }
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
    }, 100);
  });

  it('should support no hosts', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    spawnSpy.reset();
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: KEY,
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.start(function (error) {
      if (error) {
        expect().fail(function () { return error; });
      } else if (browserStackTunnel.state === 'started') {
        sinon.assert.calledOnce(spawnSpy);
        sinon.assert.calledWithExactly(
          spawnSpy,
          WIN32_BINARY_FILE, [
            KEY,
            '-logFile',
            LOG_FILE_PATH
          ]
        );
        done();
      }
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
    }, 100);
  });

  it('should use the specified binary directory', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    spawnSpy.reset();
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: KEY,
      hosts: HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.start(function (error) {
      if (error) {
        expect().fail(function () { return error; });
      } else if (browserStackTunnel.state === 'started') {
        sinon.assert.calledOnce(spawnSpy);
        sinon.assert.calledWithExactly(
          spawnSpy,
          WIN32_BINARY_FILE, [
            KEY,
            HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
            '-logFile',
            LOG_FILE_PATH
          ]
        );
        done();
      }
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
    }, 100);
  });

  it('should support the localIdentifier option', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    spawnSpy.reset();
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: KEY,
      hosts: HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
      localIdentifier: 'my_tunnel',
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.start(function (error) {
      if (error) {
        expect().fail(function () { return error; });
      } else if (browserStackTunnel.state === 'started') {
        sinon.assert.calledOnce(spawnSpy);
        sinon.assert.calledWithExactly(
          spawnSpy,
          WIN32_BINARY_FILE, [
            KEY,
            HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
            '-localIdentifier',
            'my_tunnel',
            '-logFile',
            LOG_FILE_PATH
          ]
        );
        done();
      }
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
    }, 100);
  });

  it('should support the v (verbose) option', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    spawnSpy.reset();
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: KEY,
      hosts: HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
      verbose: true,
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.start(function (error) {
      if (error) {
        expect().fail(function () { return error; });
      } else if (browserStackTunnel.state === 'started') {
        sinon.assert.calledOnce(spawnSpy);
        sinon.assert.calledWithExactly(
          spawnSpy,
          WIN32_BINARY_FILE, [
            KEY,
            HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
            '-vvv',
            '-logFile',
            LOG_FILE_PATH
          ]
        );
        done();
      }
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
    }, 100);
  });

  it('should support the force option', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    spawnSpy.reset();
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: KEY,
      hosts: HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
      force: true,
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.start(function (error) {
      if (error) {
        expect().fail(function () { return error; });
      } else if (browserStackTunnel.state === 'started') {
        sinon.assert.calledOnce(spawnSpy);
        sinon.assert.calledWithExactly(
          spawnSpy,
          WIN32_BINARY_FILE, [
            KEY,
            HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
            '-force',
            '-logFile',
            LOG_FILE_PATH
          ]
        );
        done();
      }
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
    }, 100);
  });

  it('should support the forcelocal option', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    spawnSpy.reset();
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: KEY,
      hosts: HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
      forcelocal: true,
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.start(function (error) {
      if (error) {
        expect().fail(function () { return error; });
      } else if (browserStackTunnel.state === 'started') {
        sinon.assert.calledOnce(spawnSpy);
        sinon.assert.calledWithExactly(
          spawnSpy,
          WIN32_BINARY_FILE, [
            KEY,
            HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
            '-forcelocal',
            '-logFile',
            LOG_FILE_PATH
          ]
        );
        done();
      }
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
    }, 100);
  });

  it('should support the onlyAutomate option', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    spawnSpy.reset();
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: KEY,
      hosts: HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
      onlyAutomate: true,
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.start(function (error) {
      if (error) {
        expect().fail(function () { return error; });
      } else if (browserStackTunnel.state === 'started') {
        sinon.assert.calledOnce(spawnSpy);
        sinon.assert.calledWithExactly(
          spawnSpy,
          WIN32_BINARY_FILE, [
            KEY,
            HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
            '-onlyAutomate',
            '-logFile',
            LOG_FILE_PATH
          ]
        );
        done();
      }
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
    }, 100);
  });

  it('should support the proxy options', function (done) {
    binaryPathMock.returns(WIN32_BINARY_FILE);
    spawnSpy.reset();
    var browserStackTunnel = new bs.BrowserStackTunnel({
      key: KEY,
      hosts: HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
      proxyUser: PROXY_USER,
      proxyPass: PROXY_PASS,
      proxyPort: PROXY_PORT,
      proxyHost: PROXY_HOST,
      binaryPath: WIN32_BINARY_FILE
    });
    browserStackTunnel.start(function (error) {
      if (error) {
        expect().fail(function () { return error; });
      } else if (browserStackTunnel.state === 'started') {
        sinon.assert.calledOnce(spawnSpy);
        sinon.assert.calledWithExactly(
          spawnSpy,
          WIN32_BINARY_FILE, [
            KEY,
            HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
            '-proxyHost',
            PROXY_HOST,
            '-proxyPort',
            PROXY_PORT,
            '-proxyUser',
            PROXY_USER,
            '-proxyPass',
            PROXY_PASS,
            '-logFile',
            LOG_FILE_PATH
          ]
        );
        done();
      }
    });

    setTimeout(function () {
      browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
    }, 100);
  });

  describe('on windows', function () {
    beforeEach(function () {
      osMock._platform = 'win32';
      osMock._arch = 'x64';
    });

    it('should download new binary if binary is not present', function (done) {
      platformMock.returns('win32');
      archMock.returns(null);
      binaryPathMock.returns(NEW_WIN32_BINARY_FILE);
      var browserStackTunnel = new bs.BrowserStackTunnel({
        key: 'MONKEY_KEY',
        binaryPath: NEW_WIN32_BINARY_FILE
      });
      browserStackTunnel.start(function (error) {
        if (error) {
          expect().fail(function () { return error; });
        }
        expect(fsMock.fileNameModded).to.equal(NEW_WIN32_BINARY_FILE);
        expect(fsMock.mode).to.equal('0755');
        //expect(unzipMock.dirName).to.equal(NEW_BINARY_DIR);
        //expect(httpMock.url).to.equal(WIN32_BINARY_URL);
        done();
      });

      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
      }, 100);
    });

    it('should download new binary if prompted that a new version exists as auto download is not compatible with our use of spawn', function (done) {
      binaryPathMock.returns(WIN32_BINARY_FILE);
      var browserStackTunnel = new bs.BrowserStackTunnel({
        key: 'MONKEY_KEY',
        binaryPath: WIN32_BINARY_FILE
      });
      browserStackTunnel.start(function (error) {
        if (error) {
          expect().fail(function () { return error; });
        }
        expect(fsMock.fileNameModded).to.equal(WIN32_BINARY_FILE);
        expect(fsMock.mode).to.equal('0755');
        //expect(unzipMock.dirName).to.equal(WIN32_BINARY_DIR);
        //expect(httpMock.url).to.equal(WIN32_BINARY_URL);
        done();
      });

      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  **There is a new version of BrowserStackTunnel.jar available on server ----monkey');
        setTimeout(function () {
          browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
        }, 100);
      }, 100);
    });

    it('should use the specified binary directory', function (done) {
      binaryPathMock.returns(WIN32_BINARY_FILE);
      spawnSpy.reset();
      var browserStackTunnel = new bs.BrowserStackTunnel({
        key: KEY,
        hosts: HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
        binaryPath: WIN32_BINARY_FILE
      });
      browserStackTunnel.start(function (error) {
        if (error) {
          expect().fail(function () { return error; });
        } else if (browserStackTunnel.state === 'started') {
          sinon.assert.calledOnce(spawnSpy);
          sinon.assert.calledWithExactly(
            spawnSpy,
            WIN32_BINARY_FILE, [
              KEY,
              HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
              '-logFile',
              LOG_FILE_PATH
            ]
          );
          done();
        }
      });

      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
      }, 100);
    });
  });

  describe('on osx', function () {
    beforeEach(function () {
      osMock._platform = 'darwin';
      osMock._arch = 'x64';
    });

    it('should download new binary if binary is not present', function (done) {
      platformMock.returns('darwin');
      archMock.returns('x64');
      binaryPathMock.returns(NEW_BINARY_FILE);
      var browserStackTunnel = new bs.BrowserStackTunnel({
        key: 'MONKEY_KEY',
        binaryPath: NEW_BINARY_FILE
      });
      browserStackTunnel.start(function (error) {
        if (error) {
          expect().fail(function () { return error; });
        }
        expect(fsMock.fileNameModded).to.equal(NEW_BINARY_FILE);
        expect(fsMock.mode).to.equal('0755');
        //expect(unzipMock.dirName).to.equal(NEW_BINARY_DIR);
        //expect(httpMock.url).to.equal(OSX_BINARY_URL);
        done();
      });

      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
      }, 100);
    });

    it('should download new binary if prompted that a new version exists as auto download is not compatible with our use of spawn', function (done) {
      platformMock.returns('darwin');
      archMock.returns('x64');
      binaryPathMock.returns(OSX_BINARY_FILE);
      var browserStackTunnel = new bs.BrowserStackTunnel({
        key: 'MONKEY_KEY',
        binaryPath: OSX_BINARY_FILE
      });
      browserStackTunnel.start(function (error) {
        if (error) {
          expect().fail(function () { return error; });
        }
        expect(fsMock.fileNameModded).to.equal(OSX_BINARY_FILE);
        expect(fsMock.mode).to.equal('0755');
        //expect(unzipMock.dirName).to.equal(OSX_BINARY_DIR);
        //expect(httpMock.url).to.equal(OSX_BINARY_URL);
        done();
      });

      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  **There is a new version of BrowserStackTunnel.jar available on server ----monkey');
        setTimeout(function () {
          browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
        }, 100);
      }, 100);
    });

    it('should use the specified bin directory', function (done) {
      binaryPathMock.returns(OSX_BINARY_FILE);
      spawnSpy.reset();
      var browserStackTunnel = new bs.BrowserStackTunnel({
        key: KEY,
        hosts: HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
        binaryPath: OSX_BINARY_FILE
      });
      browserStackTunnel.start(function (error) {
        if (error) {
          expect().fail(function () { return error; });
        } else if (browserStackTunnel.state === 'started') {
          sinon.assert.calledOnce(spawnSpy);
          sinon.assert.calledWithExactly(
            spawnSpy,
            OSX_BINARY_FILE, [
              KEY,
              HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
              '-logFile',
              LOG_FILE_PATH
            ]
          );
          done();
        }
      });

      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
      }, 100);
    });
  });

  describe('on linux x64', function () {
    beforeEach(function () {
      osMock._platform = 'linux';
      osMock._arch = 'x64';
    });

    it('should download new binary if binary is not present', function (done) {
      platformMock.returns('linux');
      archMock.returns('x64');
      binaryPathMock.returns(NEW_BINARY_FILE);
      var browserStackTunnel = new bs.BrowserStackTunnel({
        key: 'MONKEY_KEY',
        binaryPath: NEW_BINARY_FILE
      });
      browserStackTunnel.start(function (error) {
        if (error) {
          expect().fail(function () { return error; });
        }
        expect(fsMock.fileNameModded).to.equal(NEW_BINARY_FILE);
        expect(fsMock.mode).to.equal('0755');
        //expect(unzipMock.dirName).to.equal(NEW_BINARY_DIR);
        //expect(httpMock.url).to.equal(LINUX_64_BINARY_URL);
        done();
      });

      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
      }, 100);
    });

    it('should download new binary if prompted that a new version exists as auto download is not compatible with our use of spawn', function (done) {
      platformMock.returns('linux');
      archMock.returns('x64');
      binaryPathMock.returns(LINUX_64_BINARY_FILE);
      var browserStackTunnel = new bs.BrowserStackTunnel({
        key: 'MONKEY_KEY',
        binaryPath: LINUX_64_BINARY_FILE
      });
      browserStackTunnel.start(function (error) {
        if (error) {
          expect().fail(function () { return error; });
        }
        expect(fsMock.fileNameModded).to.equal(LINUX_64_BINARY_FILE);
        expect(fsMock.mode).to.equal('0755');
        //expect(unzipMock.dirName).to.equal(LINUX_64_BINARY_DIR);
        //expect(httpMock.url).to.equal(LINUX_64_BINARY_URL);
        done();
      });

      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  **There is a new version of BrowserStackTunnel.jar available on server ----monkey');
        setTimeout(function () {
          browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
        }, 100);
      }, 100);
    });

    it('should use the specified bin directory', function (done) {
      binaryPathMock.returns(LINUX_64_BINARY_FILE);
      spawnSpy.reset();
      var browserStackTunnel = new bs.BrowserStackTunnel({
        key: KEY,
        hosts: HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
        binaryPath: LINUX_64_BINARY_FILE
      });
      browserStackTunnel.start(function (error) {
        if (error) {
          expect().fail(function () { return error; });
        } else if (browserStackTunnel.state === 'started') {
          sinon.assert.calledOnce(spawnSpy);
          sinon.assert.calledWithExactly(
            spawnSpy,
            LINUX_64_BINARY_FILE, [
              KEY,
              HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
              '-logFile',
              LOG_FILE_PATH
            ]
          );
          done();
        }
      });

      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
      }, 100);
    });
  });

  describe('on linux ia32', function () {
    beforeEach(function () {
      osMock._platform = 'linux';
      osMock._arch = 'ia32';
    });

    it('should download new binary if binary is not present', function (done) {
      platformMock.returns('linux');
      archMock.returns('ia32');
      binaryPathMock.returns(NEW_BINARY_FILE);
      var browserStackTunnel = new bs.BrowserStackTunnel({
        key: 'MONKEY_KEY',
        binaryPath: NEW_BINARY_FILE
      });
      browserStackTunnel.start(function (error) {
        if (error) {
          expect().fail(function () { return error; });
        }
        expect(fsMock.fileNameModded).to.equal(NEW_BINARY_FILE);
        expect(fsMock.mode).to.equal('0755');
        //expect(unzipMock.dirName).to.equal(NEW_BINARY_DIR);
        //expect(httpMock.url).to.equal(LINUX_32_BINARY_URL);
        done();
      });

      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
      }, 100);
    });

    it('should download new binary if prompted that a new version exists as auto download is not compatible with our use of spawn', function (done) {
      platformMock.returns('linux');
      archMock.returns('ia32');
      binaryPathMock.returns(LINUX_32_BINARY_FILE);
      var browserStackTunnel = new bs.BrowserStackTunnel({
        key: 'MONKEY_KEY',
        binaryPath: LINUX_32_BINARY_FILE
      });
      browserStackTunnel.start(function (error) {
        if (error) {
          expect().fail(function () { return error; });
        }
        expect(fsMock.fileNameModded).to.equal(LINUX_32_BINARY_FILE);
        expect(fsMock.mode).to.equal('0755');
        //expect(unzipMock.dirName).to.equal(LINUX_32_BINARY_DIR);
        //expect(httpMock.url).to.equal(LINUX_32_BINARY_URL);
        done();
      });

      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  **There is a new version of BrowserStackTunnel.jar available on server ----monkey');
        setTimeout(function () {
          browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
        }, 100);
      }, 100);
    });

    it('should use the specified bin directory', function (done) {
      binaryPathMock.returns(LINUX_32_BINARY_FILE);
      spawnSpy.reset();
      var browserStackTunnel = new bs.BrowserStackTunnel({
        key: KEY,
        hosts: HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
        binaryPath: LINUX_32_BINARY_FILE
      });
      browserStackTunnel.start(function (error) {
        if (error) {
          expect().fail(function () { return error; });
        } else if (browserStackTunnel.state === 'started') {
          sinon.assert.calledOnce(spawnSpy);
          sinon.assert.calledWithExactly(
            spawnSpy,
            LINUX_32_BINARY_FILE, [
              KEY,
              HOST_NAME + ',' + PORT + ',' + SSL_FLAG,
              '-logFile',
              LOG_FILE_PATH
            ]
          );
          done();
        }
      });

      setTimeout(function () {
        browserStackTunnel.tail.emit('mock:child_process:stdout:data', 'monkey-----  Press Ctrl-C to exit ----monkey');
      }, 100);
    });
  });

  after(function () {
    childProcessMock.cleanUp();
  });
});
