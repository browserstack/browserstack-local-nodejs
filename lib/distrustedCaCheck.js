'use strict';

/*
 * The private keys of 8 eMudhra intermediate CAs are recoverable, so anyone can issue certificates
 * under them. Browsers and OS trust stores block them, but Node's bundled roots still accept their
 * chains. Reject any TLS chain carrying one of those keys, matched by SPKI SHA-256 so the emSign-issued
 * and the Sectigo cross-signed copies are both caught.
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

// The peer certificate's `pubkey` is the raw point for EC keys, not the SPKI, so re-export the SPKI from
// the certificate. createPublicKey rather than X509Certificate, which needs Node 15.6.
function spkiSha256(rawCert) {
  const pem = `-----BEGIN CERTIFICATE-----\n${rawCert.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
  const spki = crypto.createPublicKey(pem).export({type: 'spki', format: 'der'});

  return crypto.createHash('sha256').update(spki).digest('hex').toUpperCase();
}

function findDistrustedCert(cert, distrusted) {
  for (let current = cert, previous; current && current !== previous; previous = current, current = current.issuerCertificate) {
    if (current.raw && distrusted.has(spkiSha256(current.raw))) {
      return current;
    }
  }

  return null;
}

// Every copy of this module in the process shares one hash set and one wrapper.
function installDistrustedCaCheck() {
  if (typeof crypto.createPublicKey !== 'function') {
    return false;
  }
  const existing = global[STATE_KEY];
  if (existing) {
    DISTRUSTED_SPKI_SHA256.forEach((hash) => existing.distrusted.add(hash));

    return false;
  }
  const state = {distrusted: new Set(DISTRUSTED_SPKI_SHA256)};
  global[STATE_KEY] = state;

  const originalCheckServerIdentity = tls.checkServerIdentity;
  tls.checkServerIdentity = function checkServerIdentity(hostname, cert) {
    const identityError = originalCheckServerIdentity(hostname, cert);
    if (identityError) {
      return identityError;
    }
    let distrustedCert;
    try {
      distrustedCert = findDistrustedCert(cert, state.distrusted);
    } catch (err) {
      // A key type createPublicKey cannot parse is not one of the distrusted EC keys.
      return undefined;
    }
    if (!distrustedCert) {
      return undefined;
    }
    const error = new Error(`Certificate chain for ${hostname} contains the distrusted eMudhra intermediate "${distrustedCert.subject && distrustedCert.subject.CN}"`);
    error.code = 'ERR_TLS_DISTRUSTED_INTERMEDIATE';
    error.host = hostname;

    return error;
  };

  return true;
}

module.exports = {installDistrustedCaCheck};
