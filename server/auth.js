const crypto = require('crypto');
require('dotenv').config();

const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'kotialy';
const AUTH_SECRET = process.env.AUTH_SECRET || 'kotialy_default_secret_key_change_in_production';
const AUTH_TOKEN_DAYS = parseInt(process.env.AUTH_TOKEN_DAYS || '365');

/**
 * Check if an IP address belongs to a local / private network.
 */
function isLocalIp(ip) {
  if (!ip) return false;

  // Clean ipv6-mapped ipv4 prefix (e.g. ::ffff:192.168.1.1)
  let cleanIp = ip.trim();
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.slice(7);
  }

  // Loopback
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
    return true;
  }

  // IPv6 Link-local and Unique Local
  if (cleanIp.startsWith('fe80:') || cleanIp.startsWith('fc00:') || cleanIp.startsWith('fd00:')) {
    return true;
  }

  // IPv4 Private Ranges
  const parts = cleanIp.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
    const [a, b] = parts;

    // 127.0.0.0/8
    if (a === 127) return true;

    // 10.0.0.0/8
    if (a === 10) return true;

    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;

    // 100.64.0.0/10 (Tailscale & Carrier-grade NAT: 100.64.0.0 - 100.127.255.255)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 169.254.0.0/16 (Link-local)
    if (a === 169 && b === 254) return true;
  }

  return false;
}

/**
 * Get client IP from Express request or WebSocket request.
 */
function getClientIp(req) {
  const forwarded = req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']);
  if (forwarded) {
    const list = String(forwarded).split(',');
    // First IP in X-Forwarded-For is client origin
    return list[0].trim();
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || '';
}

/**
 * Create a signed long-lived token (default 365 days / 1 year).
 */
function generateToken(username, role = 'admin') {
  const secret = process.env.AUTH_SECRET || 'kotialy_default_secret_key_change_in_production';
  const tokenDays = parseInt(process.env.AUTH_TOKEN_DAYS || '365');
  const expiresAt = Date.now() + tokenDays * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ u: username, role, exp: expiresAt })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

/**
 * Verify a signed token. Returns parsed payload or null.
 */
function verifyToken(tokenStr) {
  if (!tokenStr || typeof tokenStr !== 'string') return null;
  const parts = tokenStr.split('.');
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const secret = process.env.AUTH_SECRET || 'kotialy_default_secret_key_change_in_production';
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  if (signature !== expectedSig) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) {
      return null; // Expired
    }
    return {
      u: data.u,
      role: data.role || 'admin',
      exp: data.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Express Middleware:
 * If request is from LAN -> passes through automatically as admin.
 * If request is from WAN -> requires valid Bearer token.
 */
function requireAuthOrLan(req, res, next) {
  const ip = getClientIp(req);

  if (isLocalIp(ip)) {
    req.isLocal = true;
    req.user = 'lan_user';
    req.role = 'admin';
    return next();
  }

  req.isLocal = false;

  // Check Bearer token from header or query
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.query && req.query.token) {
    token = String(req.query.token).trim();
  }

  const valid = verifyToken(token);
  if (valid) {
    req.user = valid.u;
    req.role = valid.role || 'admin';
    return next();
  }

  return res.status(401).json({
    error: 'Kirjautuminen vaaditaan (ulkoverkkoyhteys)',
    requireAuth: true,
    isLocal: false,
  });
}

/**
 * Express Middleware to restrict mutations to admin role.
 */
function requireAdmin(req, res, next) {
  if (req.role !== 'admin') {
    return res.status(403).json({
      error: 'Toiminto vaatii ylläpitäjän oikeudet (vain luku -tunnus)',
      readOnly: true,
    });
  }
  next();
}

/**
 * Validate credentials against Admin or Viewer configuration.
 * Returns { valid: true, role: 'admin' | 'viewer', username } or { valid: false }.
 */
function checkCredentials(username, password) {
  const u = String(username || '').trim();
  const p = String(password || '');

  // 1. Check Admin
  const adminUser = (process.env.AUTH_USERNAME || 'admin').trim();
  const adminPass = process.env.AUTH_PASSWORD || 'kotialy';
  if (u === adminUser && p === adminPass) {
    return { valid: true, role: 'admin', username: u };
  }

  // 2. Check Viewer (optional)
  const viewerUser = (process.env.AUTH_VIEWER_USERNAME || '').trim();
  const viewerPass = process.env.AUTH_VIEWER_PASSWORD || '';
  if (viewerUser && viewerPass && u === viewerUser && p === viewerPass) {
    return { valid: true, role: 'viewer', username: u };
  }

  return { valid: false };
}

module.exports = {
  isLocalIp,
  getClientIp,
  generateToken,
  verifyToken,
  requireAuthOrLan,
  requireAdmin,
  checkCredentials,
  AUTH_USERNAME,
  AUTH_TOKEN_DAYS,
};
