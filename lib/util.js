const HttpsProxyAgent = require('https-proxy-agent');

const isUndefined = value => (value === undefined || value === null || value === 'undefined');
module.exports.isUndefined = isUndefined;

const isBlank = value => (isUndefined(value) || value === '');

/* Builds the proxy agent for every binary-download request: the in-process async
   download and the scripts the sync path spawns. Without proxyUser/proxyPass in it,
   an authenticating proxy answers the CONNECT with 407 and the binary is never
   downloaded, even though the running binary gets them as --proxy-user/--proxy-pass.
   Same rule as the README: proxyPass is ignored unless proxyUser is set. */
module.exports.buildProxyAgent = (proxyHost, proxyPort, proxyUser, proxyPass) => {
  if(isBlank(proxyHost) || isBlank(proxyPort)) return undefined;
  const agentOptions = { host: proxyHost, port: proxyPort };
  if(!isBlank(proxyUser)) {
    /* https-proxy-agent sends this as `Proxy-Authorization: Basic base64(auth)`. */
    agentOptions.auth = proxyUser + ':' + (isUndefined(proxyPass) ? '' : proxyPass);
  }
  return new HttpsProxyAgent(agentOptions);
};
