const authManager = require('./authMiddleware');

// Detect Home Assistant add-on environment
const IS_HA_ADDON = !!process.env.SUPERVISOR_TOKEN;

function isLoopbackIp(ip) {
  if (!ip) return false;
  // Express may provide IPv6 and IPv4-mapped IPv6 forms
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.endsWith('::1')
  );
}

function isDockerInternal(ip) {
  if (!ip) return false;
  // Docker internal network ranges (172.30.x.x is common for HA add-ons)
  return (
    ip.startsWith('172.') ||
    ip.startsWith('::ffff:172.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('::ffff:192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('::ffff:10.')
  );
}

function getClientIp(req) {
  // Avoid trusting X-Forwarded-For by default.
  // If you later run behind a reverse proxy, set app.set('trust proxy', true)
  // and/or update this accordingly.
  return req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
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

  // In HA add-on mode, trust Docker internal network (ingress proxy)
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
