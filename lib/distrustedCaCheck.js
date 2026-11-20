'use strict';

/*
 * The private keys of 8 eMudhra intermediate CAs are recoverable, so anyone can issue certificates
 * under them. Browsers and OS trust stores block them, but Node's bundled roots still accept their
 * chains. Reject any TLS chain that carries one of those keys (SPKI SHA-256, which catches both the
 * emSign-issued and the Sectigo cross-signed copies) or one of their names.
 * Source: https://emudhra.we-have-a-problem.com/impacted-intermediates.json
 */

const tls = require('tls');
const crypto = require('crypto');

const STATE_KEY = Symbol.for('browserstack.distrustedCaCheck');

const DISTRUSTED_SPKI_SHA256 = [
  'EBED6475C2C2D80FCB199F3FE8DD6E6B3CE60B77EB15D4E42C3DEC0C6F5B5105', // EM DV TLS CA - G3B
  '43BFFA19D6EF651451F6841E019931E96F6F2EAEFF28AB4B6F1CE4576DE2717B', // EM OV TLS CA - G3B
  'E0254C7FCDC265E2F0F8A428DABB75AB4AE039B4872D62F5EE57F0877D5A8A41', // EM EV TLS CA - G3B
  '49DD353DC2B919A3770645117D0E60C16115E7D1BC259EEFE734B00EA434FE5F', // EM DV TLS CA - G3C
  '63ECEFEE431D49523BC1136C4E72D0206A477086CAF606CD5CF025686C109CF8', // EM OV TLS CA - G3C
  '5C0660A2B164910D8FF589C18E14552E9E0EC237DCEFE2CB736D41A4811F81A0', // EM EV TLS CA - G3C
  'EC4FFA1AD0AC88081314B7AAFFEF6A91F97CD57291BB5BA686C5415F5EB4F6B6', // EM OV CS CA - G3B
  '92C063D67E8F14DB71D288E11266FFDAF69CBF115F7BAB14F3BC2F68D25E0E30' // EM OV CS CA - G3C
];

// Node links issuerCertificate by name, so a decoy certificate sent ahead of the real intermediate can divert
// the walk away from the distrusted key. The 8 intermediates are pathlen:0, so the leaf's issuer is always
// one of their names; matching names closes that gap.
const DISTRUSTED_NAMES = [
  'EM DV TLS CA - G3B|eMudhra BV|NL',
  'EM OV TLS CA - G3B|eMudhra BV|NL',
  'EM EV TLS CA - G3B|eMudhra BV|NL',
  'EM DV TLS CA - G3C|eMudhra Inc|US',
  'EM OV TLS CA - G3C|eMudhra Inc|US',
  'EM EV TLS CA - G3C|eMudhra Inc|US',
  'EM OV CS CA - G3B|eMudhra BV|NL',
  'EM OV CS CA - G3C|eMudhra Inc|US'
].map((name) => name.toLowerCase());

// OpenSSL chains names case-insensitively with whitespace collapsed, so compare them the same way.
function normalize(value) {
  return String((Array.isArray(value) ? value.join(',') : value) || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function nameKey(name) {
  return name ? `${normalize(name.CN)}|${normalize(name.O)}|${normalize(name.C)}` : '';
}

// The peer certificate's `pubkey` is the raw point for EC keys, not the SPKI, so re-export the SPKI from
// the certificate. createPublicKey rather than X509Certificate, which needs Node 15.6.
function spkiSha256(rawCert) {
  const pem = `-----BEGIN CERTIFICATE-----\n${rawCert.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
  const spki = crypto.createPublicKey(pem).export({type: 'spki', format: 'der'});

  return crypto.createHash('sha256').update(spki).digest('hex').toUpperCase();
}

// Returns the name of the distrusted intermediate found in the chain, or null.
function findDistrustedIntermediate(cert, state) {
  for (let current = cert, previous; current && current !== previous; previous = current, current = current.issuerCertificate) {
    if (state.distrustedNames.has(nameKey(current.subject))) {
      return current.subject.CN;
    }
    if (state.distrustedNames.has(nameKey(current.issuer))) {
      return current.issuer.CN;
    }
    let hash;
    try {
      hash = current.raw && spkiSha256(current.raw);
    } catch (err) {
      // A key createPublicKey cannot parse is not one of the distrusted EC keys; keep checking its issuers.
      continue;
    }
    if (hash && state.distrusted.has(hash)) {
      return (current.subject && current.subject.CN) || 'unknown';
    }
  }

  return null;
}

// Every copy of this module in the process shares one state and one wrapper. The state lives on the tls module,
// not on global: Jest gives each test file its own global but shares core modules across them.
function installDistrustedCaCheck() {
  if (typeof crypto.createPublicKey !== 'function') {
    return false;
  }
  const existing = tls[STATE_KEY];
  if (existing) {
    DISTRUSTED_SPKI_SHA256.forEach((hash) => existing.distrusted.add(hash));
    DISTRUSTED_NAMES.forEach((name) => existing.distrustedNames.add(name));

    return false;
  }
  const state = {distrusted: new Set(DISTRUSTED_SPKI_SHA256), distrustedNames: new Set(DISTRUSTED_NAMES)};
  tls[STATE_KEY] = state;

  const originalCheckServerIdentity = tls.checkServerIdentity;
  tls.checkServerIdentity = function checkServerIdentity(hostname, cert) {
    const identityError = originalCheckServerIdentity(hostname, cert);
    if (identityError) {
      return identityError;
    }
    const distrustedName = findDistrustedIntermediate(cert, state);
    if (!distrustedName) {
      return undefined;
    }
    const error = new Error(`Certificate chain for ${hostname} contains the distrusted eMudhra intermediate "${distrustedName}"`);
    error.code = 'ERR_TLS_DISTRUSTED_INTERMEDIATE';
    error.host = hostname;

    return error;
  };

  return true;
}

module.exports = {installDistrustedCaCheck};
