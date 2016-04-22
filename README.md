# browserstack-local-nodejs

[![Build Status](https://travis-ci.org/browserstack/browserstack-local-nodejs.svg?branch=master)](https://travis-ci.org/browserstack/browserstack-local-nodejs)

A simple Ruby wrapper for BrowserStack Local Binary.

## Installation:

```
gem install browserstack-local
```

## Example:

```
require 'browserstack-local'

#creates an instance of Local
bs_local = BrowserStack::Local.new

#replace <browserstack-accesskey> with your key. 
# you may not add it if you have 'BROWSERSTACK_ACCESS_KEY' in your environment variables.
bs_local_args = { "key" => "<browserstack-accesskey>" }

#starts the Local instance with the required arguments
bs_local.start(bs_local_args)

#check if BrowserStack local instance is running
bs_local.isRunning

#stop the Local instance
bs_local.stop

```

## Additional Arguments

Apart from the key all other arguments are optional. For the full list of arguments, refer [BrowserStack Local modifiers](https://www.browserstack.com/local-testing#modifiers). To specify these arguments add them to the input hash for the BrowserStack::Local without the hyphen. For examples, refer below -  

#### Verbose Logging
To enable verbose logging - 
```
bs_local_args = { "key" => "BROWSERSTACK_ACCESS_KEY" , "v" => "true"}
```

#### Folder Testing
To test local folder rather internal server, provide path to folder as value of this option - 
```
bs_local_args = { "key" => "BROWSERSTACK_ACCESS_KEY" , "f" => "/my/awesome/folder"}
```

#### Force Start 
To kill other running Browserstack Local instances - 
```
bs_local_args = { "key" => "BROWSERSTACK_ACCESS_KEY" , "force" => "true"}
```

#### Only Automate
To disable local testing for Live and Screenshots, and enable only Automate - 
```
bs_local_args = { "key" => "BROWSERSTACK_ACCESS_KEY" , "onlyAutomate" => "true"}
```

#### Force Local
To route all traffic via local(your) machine - 
```
bs_local_args = { "key" => "BROWSERSTACK_ACCESS_KEY" , "forcelocal" => "true"}
```

### Proxy
To use a proxy for local testing -  

* proxyHost: Hostname/IP of proxy, remaining proxy options are ignored if this option is absent
* proxyPort: Port for the proxy, defaults to 3128 when -proxyHost is used
* proxyUser: Username for connecting to proxy (Basic Auth Only)
* proxyPass: Password for USERNAME, will be ignored if USERNAME is empty or not specified

```
bs_local_args = { "key" => "BROWSERSTACK_ACCESS_KEY", "proxyHost" => "127.0.0.1", "proxyPort" => "8000", "proxyUser" => "user", "proxyPass" => "password"}
```

### Local Identifier
If doing simultaneous multiple local testing connections, set this uniquely for different processes - 
```
bs_local_args = { "key" => "BROWSERSTACK_ACCESS_KEY" , "localIdentifier" => "randomstring"}
```

### Binary Path
Path to specify local Binary path -
```
bs_local_args = { "key" => "BROWSERSTACK_ACCESS_KEY" , "binarypath" => "/browserstack/BrowserStackLocal"}
```

### Logfile 
To specify the path to file where the logs will be saved - 
```
bs_local_args = { "key" => "BROWSERSTACK_ACCESS_KEY" , "logfile" => "/browserstack/logs.txt"}
```

## Contribute

### Build Instructions

To build gem, `rake build`.

To run the test suite run, `rake test`.

### Reporting bugs

You can submit bug reports either in the Github issue tracker.

Before submitting an issue please check if there is already an existing issue. If there is, please add any additional information give it a "+1" in the comments.

When submitting an issue please describe the issue clearly, including how to reproduce the bug, which situations it appears in, what you expect to happen, what actually happens, and what platform (operating system and version) you are using.

### Pull Requests

We love pull requests! We are very happy to work with you to get your changes merged in, however please keep the following in mind.

* Adhere to the coding conventions you see in the surrounding code.
* Include tests, and make sure all tests pass.
* Before submitting a pull-request, clean up the history by going over your commits and squashing together minor changes and fixes into the corresponding commits. You can do this using the interactive rebase command.
