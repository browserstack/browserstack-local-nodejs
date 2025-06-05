const https = require('https'),
  fs = require('fs'),
  HttpsProxyAgent = require('https-proxy-agent');

const authToken = process.argv[2], proxyHost = process.argv[3], proxyPort = process.argv[4], useCaCertificate = process.argv[5], downloadFallback = process.argv[6], downloadErrorMessage = process.argv[7];

let body = '', data = {"auth_token": authToken};
const options = {
  hostname: 'k8s-devlocal.bsstag.com',
  port: 443,
  path: '/binary/api/v1/endpoint',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'user-agent': process.env.USER_AGENT
  }
};
if (downloadFallback) {
  options.headers['X-Local-Fallback-Cloudflare'] = true;
  data["error_message"] = downloadErrorMessage;
}

if(proxyHost && proxyPort) {
  options.agent = new HttpsProxyAgent({
    host: proxyHost,
    port: proxyPort
  });
}
if (useCaCertificate) {
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
      const url = JSON.parse(body).data.endpoint;
      console.log(url);
    } catch (e) {
      console.error(e);
    }
  });
  res.on('error', (err) => {
    console.error(err);  
  })
});
req.on('error', e => {
  console.error(e);
});
req.write(JSON.stringify(data));
req.end();
