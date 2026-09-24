const https = require('https'),
  fs = require('fs'),
  HttpsProxyAgent = require('https-proxy-agent'),
  { isUndefined } = require('./util');

/* The auth token and proxy credentials are read from the environment, never from
   argv: argv is world-readable via `ps` / /proc/<pid>/cmdline, whereas
   /proc/<pid>/environ is restricted to the owning user. Keep them out of this
   argument list. */
const authToken = process.env.BROWSERSTACK_LOCAL_AUTH_TOKEN, proxyUser = process.env.BROWSERSTACK_LOCAL_PROXY_USER, proxyPass = process.env.BROWSERSTACK_LOCAL_PROXY_PASS, bsHost = process.argv[2], proxyHost = process.argv[5], proxyPort = process.argv[6], useCaCertificate = process.argv[7], downloadFallback = process.argv[3], downloadErrorMessage = process.argv[4];

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
  const proxyOpts = { host: proxyHost, port: proxyPort };
  if (!isUndefined(proxyUser) && !isUndefined(proxyPass)) {
    proxyOpts.auth = `${proxyUser}:${proxyPass}`;
  }
  options.agent = new HttpsProxyAgent(proxyOpts);
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

