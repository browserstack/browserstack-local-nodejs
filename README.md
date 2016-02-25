# browserstack-local-nodejs

## Setup

```
npm install browserstack
```

## API

### Constructor

* `new browserstack.Local()`: creates an instance of Local

### Methods

* `start(options, callback)`: starts Local instance with options. The options available are detailed below.
* `stop(callback)`: stops the Local instance
* `isRunning()`: checks if Local instance is running and returns a corresponding boolean value

The first and only argument to any callback function will be an error object.

### Options

* `key`: BrowserStack Access Key
* `v`: Provides verbose logging
* `f`: If you want to test local folder rather internal server, provide path to folder as value of this option
* `force`: Kill other running Browserstack Local
* `only`: Restricts Local Testing access to specified local servers and/or folders
* `forcelocal`: Route all traffic via local machine
* `onlyAutomate`: Disable Live Testing and Screenshots, just test Automate
* `proxyHost`: Hostname/IP of proxy, remaining proxy options are ignored if this option is absent
* `proxyPort`: Port for the proxy, defaults to 3128 when -proxyHost is used
* `proxyUser`: Username for connecting to proxy (Basic Auth Only)
* `proxyPass`: Password for USERNAME, will be ignored if USERNAME is empty or not specified
* `localIdentifier`: If doing simultaneous multiple local testing connections, set this uniquely for different processes
* `hosts`: List of hosts and ports where Local must be enabled for eg. localhost,3000,1,localhost,3001,0
* `logfile`: Path to file where Local logs be saved to
* `binarypath`: Optional path to Local binary


## Tests

To run the test suite run - `npm test`.

## Example

To run the example run - `node node-example.js`.
