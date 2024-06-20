import assert from 'assert';
import test from 'selenium-webdriver/testing';
var browserstack = require('browserstack-local');
var local = new browserstack.Local();
let localOptions = {
  'key': 'BrowserStack Access Key Goes Here!'
};

test.before(function(done) {
  this.timeout(30000);
  console.log('Starting BrowserStack-Local...');
  local.start(localOptions, ()=>{
    console.log("Started BrowserStack-Local.");
    // ...Code to start WebDriver goes here...
    done();
  });
});

test.after(function() {
  this.timeout(30000);
  // ...Code to stop WebDriver goes here...
  console.log('Stopping BrowserStack-Local...');
  local.stop(()=>{
    console.log("Stopped BrowserStack-Local");
  });
});

test.describe('Example Test Suite 1', function() {
  this.timeout(30000);  
  test.it('Example Test Case 1', function() {
    // ...Test Case Code goes here...
  });
});
