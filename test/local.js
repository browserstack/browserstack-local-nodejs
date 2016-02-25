var expect = require('expect.js'),
    mocks = require('mocks'),
    browserstack = require('../index');

describe('Local', function () {
  var bsLocal;
  beforeEach(function () {
    bsLocal = new browserstack.Local();
  });

  it('should have pid when running', function (done) {
    this.timeout(15000);
    bsLocal.start({ key: process.env.BROWSERSTACK_ACCESS_KEY }, function(){
      expect(bsLocal.tunnel.pid).to.not.equal(0);
      done();
    });
  });

  it('should return is running properly', function (done) {
    this.timeout(15000);
    expect(bsLocal.isRunning()).to.not.equal(true);
    bsLocal.start({ key: process.env.BROWSERSTACK_ACCESS_KEY }, function(){
      expect(bsLocal.isRunning()).to.equal(true);
      done();
    });
  });

  it('should throw error on running multiple binary', function (done) {
    this.timeout(25000);
    bsLocal.start({ key: process.env.BROWSERSTACK_ACCESS_KEY }, function(){
      bsLocal_2 = new browserstack.Local();
      try{
        bsLocal_2.start({ key: process.env.BROWSERSTACK_ACCESS_KEY }, function(){});  
      }
      catch(err){
        expect(err.toString().trim()).to.equal('LocalError:  *** Error: Either another browserstack local client is running on your machine or some server is listening on port 45691');
        done();
      }
    });
  });

  it('should enable verbose', function (done) {
    bsLocal.start({ key: process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, v: true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('-vvv')).to.not.equal(-1);
      done();
    });
  });

  it('should set folder testing', function (done) {
    bsLocal.start({ key: process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, f: '/var/html' }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('-f')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('/var/html')).to.not.equal(-1);
      done();
    });
  });

  it('should enable force', function (done) {
    bsLocal.start({ key: process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, force: true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('-force')).to.not.equal(-1);
      done();
    });
  });

  it('should enable only', function (done) {
    bsLocal.start({ key: process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, only: true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('-only')).to.not.equal(-1);
      done();
    });
  });

  it('should enable onlyAutomate', function (done) {
    bsLocal.start({ key: process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, onlyAutomate: true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('-onlyAutomate')).to.not.equal(-1);
      done();
    });
  });

  it('should enable forcelocal', function (done) {
    bsLocal.start({ key: process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, forcelocal: true }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('-forcelocal')).to.not.equal(-1);
      done();
    });
  });

  it('should set localIdentifier', function (done) {
    bsLocal.start({ key: process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, localIdentifier: 'abcdef' }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('-localIdentifier abcdef')).to.not.equal(-1);
      done();
    });
  });

  it('should set proxy', function (done) {
    bsLocal.start({ 
      key: process.env.BROWSERSTACK_ACCESS_KEY, 
      onlyCommand: true, 
      proxyHost: 'localhost',
      proxyPort: 8080,
      proxyUser: 'user',
      proxyPass: 'pass'
    }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('-proxyHost localhost')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('-proxyPort 8080')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('-proxyUser user')).to.not.equal(-1);
      expect(bsLocal.getBinaryArgs().indexOf('-proxyPass pass')).to.not.equal(-1);
      done();
    });
  });

  it('should set hosts', function (done) {
    bsLocal.start({ key: process.env.BROWSERSTACK_ACCESS_KEY, onlyCommand: true, hosts: 'localhost,8000,0' }, function(){
      expect(bsLocal.getBinaryArgs().indexOf('localhost,8000,0')).to.not.equal(-1);
      done();
    });
  });

  afterEach(function (done) {
    bsLocal.stop(done);
  });

});
