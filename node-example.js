var browserstack = require('browserstack');

var local = new browserstack.Local();
var webdriver = require('selenium-webdriver');
var identifier = 'adqqwdqwd';

var capabilities = {
  build: 'build',
  'browserName': 'chrome',
  'os': 'OS X',
  'browserstack.local': true,
  'browserstack.localIdentifier': identifier
}

var options = {
  key: process.env.BROWSERSTACK_ACCESS_KEY,
  //hosts: [{
  //  name: 'localhost',
  //  port: 8080,
  //  sslFlag: 0
  //}],
  //path: 'bin',
  localIdentifier: identifier,
  verbose: true,
  //proxyUser: '',
  //proxyPass: '',
  //proxyPort: 80,
  //proxyHost: 'host',
  force: true,
  forcelocal: true,
  onlyAutomate: true
};

local.start(options, function(error) {
  console.log('Is Running ' + local.isRunning());
  console.log('Started');
  console.log('Is Running ' + local.isRunning());
  capabilities['browserstack.user'] = process.env.BROWSERSTACK_USERNAME;
  console.log('Is Running ' + local.isRunning());
  capabilities['browserstack.key'] = process.env.BROWSERSTACK_ACCESS_KEY
    console.log('Is Running ' + local.isRunning());
  driver = new webdriver.Builder().usingServer('http://hub.browserstack.com/wd/hub').withCapabilities(capabilities).build();
  console.log('Is Running ' + local.isRunning());
  driver.get("http://localhost:3000").then(function() {
    console.log('Is Running ' + local.isRunning());
    driver.quit().then(function() {
      console.log('Is Running ' + local.isRunning());
      local.stop(function() {
        console.log('Is Running ' + local.isRunning());
        console.log('Stopped');
      });
    });
  });
});
