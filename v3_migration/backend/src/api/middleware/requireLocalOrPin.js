const authManager = require('./authMiddleware');

// Detect Home Assistant add-on environment
const IS_HA_ADDON = !!process.env.SUPERVISOR_TOKEN;

function normalizeIp(ip) {
  const value = String(ip || '').trim().toLowerCase();
  return value.startsWith('::ffff:') ? value.slice(7) : value;
}

function isLoopbackIp(ip) {
  const normalizedIp = normalizeIp(ip);
  return normalizedIp === '127.0.0.1' || normalizedIp === '::1';
}

function isDockerInternal(ip) {
  // HA documents this exact Supervisor ingress peer, not an entire subnet.
  // Keep the exported name for existing Socket.IO callers.
  return normalizeIp(ip) === '172.30.32.2';
}

function getClientIp(req) {
  // Avoid trusting X-Forwarded-For by default.
  // If you later run behind a reverse proxy, set app.set('trust proxy', true)
  // and/or update this accordingly.
  return req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || '';
}

/**
 * Allow requests from loopback by default, otherwise require a valid PIN.
 * In HA add-on mode, also allow requests from Docker internal networks
 * (ingress proxy runs inside the HA container network).
 * PIN can be provided via:
 * - X-APP-PIN header
 * - Authorization: Bearer <PIN>
 */
module.exports = function requireLocalOrPin(req, res, next) {
  const clientIp = getClientIp(req);

  // Always allow loopback
  if (isLoopbackIp(clientIp)) return next();

  // Trust only the documented ingress peer; LAN/other containers need a PIN.
  if (IS_HA_ADDON && isDockerInternal(clientIp)) return next();

  const headerPin = req.get('X-APP-PIN');
  const auth = req.get('Authorization') || '';
  const bearerPin = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;
  const pin = headerPin || bearerPin || '';

  if (pin && authManager.verifyPin(pin)) return next();

  return res.status(403).json({
    success: false,
    error: 'Forbidden: local access or valid PIN required'
  });
};

module.exports.isLoopbackIp = isLoopbackIp;
module.exports.isDockerInternal = isDockerInternal;
