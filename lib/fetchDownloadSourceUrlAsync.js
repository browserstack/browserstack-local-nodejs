const https = require('https'),
  fs = require('fs'),
  HttpsProxyAgent = require('https-proxy-agent'),
  { isUndefined } = require('./util'),
  version = require('../package.json').version;

const packageName = 'browserstack-local-nodejs';

function fetchDownloadSourceUrlAsync(authToken, bsHost, downloadFallback, downloadErrorMessage, proxyHost, proxyPort, useCaCertificate, callback) {
  let body = '', data = {'auth_token': authToken};
  const userAgent = [packageName, version].join('/');
  const options = {
    hostname: !isUndefined(bsHost) ? bsHost : 'local.browserstack.com',
    port: 443,
    path: '/binary/api/v1/endpoint',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'user-agent': userAgent
    }
  };
  if (downloadFallback == 'true') {
    options.headers['X-Local-Fallback-Cloudflare'] = true;
    data['error_message'] = downloadErrorMessage;
  }

  if(!isUndefined(proxyHost) && !isUndefined(proxyPort)) {
    options.agent = new HttpsProxyAgent({
      host: proxyHost,
      port: proxyPort
    });
  }
  if (!isUndefined(useCaCertificate)) {
    try {
      options.ca = fs.readFileSync(useCaCertificate);
    } catch(err) {
      console.log('failed to read cert file', err);
    }
  }

  const req = https.request(options, res => {
    res.on('data', d => {
      body += d;
    });
    res.on('end', () => {
      try {
        const reqBody = JSON.parse(body);
        if(reqBody.error) {
          throw reqBody.error;
        }
        console.log(reqBody.data.endpoint);
        callback(null, reqBody.data.endpoint);
      } catch (e) {
        console.error(e);
        callback(e);
      }
    });
    res.on('error', (err) => {
      console.error(err);
      callback(err);
    });
  });
  req.on('error', e => {
    console.error(e);
    callback(e);
  });
  req.write(JSON.stringify(data));
  req.end();
}

module.exports = fetchDownloadSourceUrlAsync;
