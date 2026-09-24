const url = require('url');

module.exports.isUndefined = value => (value === undefined || value === null || value === 'undefined');

const ALLOWED_DOWNLOAD_HOSTS = ['browserstack.com'];
const ALLOWED_DOWNLOAD_HOST_SUFFIXES = ['.browserstack.com'];

// Each guard below covers a case the final host-equals check does not:
//   - empty/non-string URL: new url.URL(null) throws TypeError; explicit guard returns a clean message.
//   - URL constructor catch: convert TypeError on malformed input into our own Error.
//   - HTTPS check: allowlist matches host only; without this, http://browserstack.com would pass.
//   - null/empty hostname: URL constructor accepts forms like https:///foo where hostname is empty; give a clear error.
module.exports.validateSourceUrl = function(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== 'string') {
    throw new Error('Refusing binary download: empty source URL');
  }
  let parsed;
  try {
    parsed = new url.URL(sourceUrl);
  } catch (e) {
    throw new Error('Refusing binary download: malformed source URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Refusing binary download from non-HTTPS source URL');
  }
  const host = (parsed.hostname || '').toLowerCase();
  if (!host) {
    throw new Error('Refusing binary download: source URL has no host');
  }
  if (ALLOWED_DOWNLOAD_HOSTS.indexOf(host) !== -1) return sourceUrl;
  for (const suffix of ALLOWED_DOWNLOAD_HOST_SUFFIXES) {
    if (host.endsWith(suffix)) return sourceUrl;
  }
  throw new Error("Refusing binary download: host '" + host + "' is not in the allowed host list");
};
