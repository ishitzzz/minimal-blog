// services/geo.js
// IP hashing (SHA-256) and lightweight geolocation via geoip-lite.
// ──────────────────────────────────────────────────────────────

const crypto = require('crypto');
const geoip  = require('geoip-lite');

/**
 * Look up geolocation data for an IP address.
 * Returns { country_code, city }.
 * Returns { country_code: null, city: null } for private / unresolvable IPs.
 */
function getGeoFromIp(ip) {
  const geo = geoip.lookup(ip);

  if (!geo) {
    return { country_code: null, city: null };
  }

  return {
    country_code: geo.country || null,
    city: geo.city || null,
  };
}

/**
 * Return a SHA-256 hex hash of the given IP string.
 * The raw IP is discarded after hashing and never stored.
 */
function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

module.exports = { getGeoFromIp, hashIp };
