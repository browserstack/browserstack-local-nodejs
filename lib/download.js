const https = require('https'),
  fs = require('fs'),
  HttpsProxyAgent = require('https-proxy-agent'),
  url = require('url'),
  zlib = require('zlib');

const binaryPath = process.argv[2], httpPath = process.argv[3], proxyHost = process.argv[4], proxyPort = process.argv[5], useCaCertificate = process.argv[6];

var fileStream = fs.createWriteStream(binaryPath);

var options = url.parse(httpPath);
if(proxyHost && proxyPort) {
  options.agent = new HttpsProxyAgent({
    host: proxyHost,
    port: proxyPort
  });
  if (useCaCertificate) {
    try {
      options.ca = fs.readFileSync(useCaCertificate);
    } catch(err) {
      console.log('failed to read cert file', err);
    }
  }
}

options.headers = Object.assign({}, options.headers, {
  'accept-encoding': 'gzip, *',
  'user-agent': process.env.USER_AGENT,
});

https.get(options, function (response) {
  const contentEncoding = response.headers['content-encoding'];
  if (typeof contentEncoding === 'string' && contentEncoding.match(/gzip/i)) {
    if (process.env.BROWSERSTACK_LOCAL_DEBUG_GZIP) {
      console.info('Using gzip in ' + options.headers['user-agent']);
    }

    response.pipe(zlib.createGunzip()).pipe(fileStream);
  } else {
    response.pipe(fileStream);
  }

  response.on('error', function(err) {
    console.error('Got Error in binary download response', err);
  });
  fileStream.on('error', function (err) {
    console.error('Got Error while downloading binary file', err);
  });
  fileStream.on('close', function () {
    console.log('Done');
  });
}).on('error', function(err) {
  console.error('Got Error in binary downloading request', err);
});
