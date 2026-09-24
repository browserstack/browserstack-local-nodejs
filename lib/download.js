const https = require('https'),
  fs = require('fs'),
  HttpsProxyAgent = require('https-proxy-agent'),
  url = require('url'),
  zlib = require('zlib'),
  { isUndefined } = require('./util');

const binaryPath = process.argv[2], httpPath = process.argv[3], proxyHost = process.argv[4], proxyPort = process.argv[5], useCaCertificate = process.argv[6];

var fileStream = fs.createWriteStream(binaryPath);

/* Must be attached before the async https.get: createWriteStream emits 'error'
   on the next tick, and with no listener node turns that into a hard throw. */
var request;

fileStream.on('error', function (err) {
  console.error('Got Error while downloading binary file', err);
  process.exitCode = 1;
  /* Otherwise the child keeps downloading into a dead stream and the parent's
     spawnSync blocks for a whole download before it can retry. */
  if(request) request.destroy();
});

var options = url.parse(httpPath);
/* isUndefined, not plain truthiness: the parent passes literal `undefined`
   placeholders for the proxy slots when only a CA is configured, and those
   arrive here as the *string* "undefined" — which is truthy, and previously
   built a proxy agent pointing at the host "undefined". */
if(!isUndefined(proxyHost) && !isUndefined(proxyPort)) {
  options.agent = new HttpsProxyAgent({
    host: proxyHost,
    port: proxyPort
  });
}

/* Applied regardless of whether a proxy is configured: this is the caller's TLS
   trust anchor, and silently falling back to the system store when no proxy is
   set ignored what they asked for. Mirrors LocalBinary.js's async download path. */
if (!isUndefined(useCaCertificate)) {
  try {
    options.ca = fs.readFileSync(useCaCertificate);
  } catch(err) {
    console.log('failed to read cert file', err);
  }
}

options.headers = Object.assign({}, options.headers, {
  'accept-encoding': 'gzip, *',
  'user-agent': process.env.USER_AGENT,
});

request = https.get(options, function (response) {
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
  fileStream.on('close', function () {
    if(process.exitCode === 1) return; // errored; not a completed download
    console.log('Done');
  });
}).on('error', function(err) {
  if(process.exitCode === 1) return; // our own destroy() landing
  console.error('Got Error in binary downloading request', err);
});
