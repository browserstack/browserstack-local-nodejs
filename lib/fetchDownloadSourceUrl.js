const https = require('https'),
  fs = require('fs'),
  HttpsProxyAgent = require('https-proxy-agent'),
  { isUndefined } = require('./util');

const authToken = process.argv[2], bsHost = process.argv[3], proxyHost = process.argv[6], proxyPort = process.argv[7], useCaCertificate = process.argv[8], downloadFallback = process.argv[4], downloadErrorMessage = process.argv[5];

let body = '', data = {'auth_token': authToken};
const options = {
  hostname: !isUndefined(bsHost) ? bsHost : 'local.browserstack.com',
  port: 443,
  path: '/binary/api/v1/endpoint',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'user-agent': process.env.USER_AGENT
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
    } catch (e) {
      console.error(e);
    }
  });
  res.on('error', (err) => {
    console.error(err);
  });
});
req.on('error', e => {
  console.error(e);
});
req.write(JSON.stringify(data));
req.end();

